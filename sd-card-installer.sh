#!/bin/bash

set -euo pipefail

# Check for root privileges
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)"
    exit 1
fi

# Check arguments
if [ $# -ne 3 ]; then
    echo "Usage: $0 <sd-device> <hostname> <ssh-key-file>"
    echo "Example: $0 /dev/mmcblk0 Livingroom /home/michael/.ssh/id_ed25519.pub"
    exit 1
fi

SD_DEVICE="$1"
HOSTNAME="$2"
SSH_KEY_FILE="$3"

USER_NAME="michael"
PASS_HASH='$5$uh6Ct0Igle$oqLcV/s6x48ZUhQhw8qUGgbXM2B/pVm3NJlFOW8Kuq0'

RPI_DL_ROOT="https://downloads.raspberrypi.org"
LTS_SERIES="raspios_oldstable_lite_arm64"
OS_URL=""
OS_FILE_XZ=""
OS_FILE=""

BOOT_MNT="/mnt/boot"
ROOT_MNT="/mnt/root"
CONFIG_TXT=""

# Validate SSH key file
if [ ! -f "$SSH_KEY_FILE" ]; then
    echo "Error: $SSH_KEY_FILE not found"
    exit 1
fi
SSH_KEY="$(cat "$SSH_KEY_FILE")"

# Validate SD device
if [ ! -b "$SD_DEVICE" ]; then
    echo "Error: $SD_DEVICE is not a block device. Check with 'lsblk'."
    exit 1
fi

cleanup() {
    set +e
    sync
    mountpoint -q "$BOOT_MNT" && umount -l "$BOOT_MNT"
    mountpoint -q "$ROOT_MNT" && umount -l "$ROOT_MNT"
    [ -d "$BOOT_MNT" ] && rmdir "$BOOT_MNT" 2>/dev/null
    [ -d "$ROOT_MNT" ] && rmdir "$ROOT_MNT" 2>/dev/null
}
trap cleanup EXIT

get_part() {
    local dev="$1"
    local num="$2"
    if [[ "$dev" =~ (mmcblk|nvme) ]]; then
        echo "${dev}p${num}"
    else
        echo "${dev}${num}"
    fi
}

version_ge() {
    # returns success if $1 >= $2
    [ "$(printf '%s\n' "$2" "$1" | sort -V | tail -n1)" = "$1" ]
}

detect_image_kernel() {
    local kver
    kver="$(ls -1 "$ROOT_MNT/lib/modules" | sort -V | tail -n1)"
    if [ -z "$kver" ]; then
        echo "Could not detect kernel version from image" >&2
        exit 1
    fi
    echo "$kver"
}

overlay_for_board() {
    local board="$1"
    local kernel="$2"

    case "$board" in
        dac)
            echo "hifiberry-dac"
            ;;
        dac8x)
            echo "hifiberry-dac8x"
            ;;
        dacplus-standard|amp2|amp4)
            if version_ge "$kernel" "6.1.77"; then
                echo "hifiberry-dacplus-std"
            else
                echo "hifiberry-dacplus"
            fi
            ;;
        dacplus-pro|dac2-pro)
            if version_ge "$kernel" "6.1.77"; then
                echo "hifiberry-dacplus-pro"
            else
                echo "hifiberry-dacplus"
            fi
            ;;
        dacplusdsp)
            echo "hifiberry-dacplusdsp"
            ;;
        dac2-hd)
            echo "hifiberry-dacplushd"
            ;;
        dacplusadc)
            echo "hifiberry-dacplusadc"
            ;;
        dacplusadcpro|dac2-adc-pro)
            echo "hifiberry-dacplusadcpro"
            ;;
        digi|digi2-standard)
            echo "hifiberry-digi"
            ;;
        digi-pro|digi2-pro)
            echo "hifiberry-digi-pro"
            ;;
        amp)
            echo "hifiberry-amp"
            ;;
        amp3)
            echo "hifiberry-amp3"
            ;;
        amp4pro)
            echo "hifiberry-amp4pro"
            ;;
        *)
            echo "Unknown board model: $board" >&2
            exit 1
            ;;
    esac
}

ensure_group_member() {
    local group_name="$1"
    local member="$2"
    local group_file="$3"

    awk -F: -v grp="$group_name" -v usr="$member" '
    BEGIN { OFS=FS }
    {
        if ($1 == grp) {
            found = 0
            if ($4 == "") {
                $4 = usr
            } else {
                n = split($4, a, ",")
                for (i = 1; i <= n; i++) {
                    if (a[i] == usr) {
                        found = 1
                    }
                }
                if (!found) {
                    $4 = $4 "," usr
                }
            }
        }
        print
    }' "$group_file" > "${group_file}.tmp" && mv "${group_file}.tmp" "$group_file"
}

write_nm_connection() {
    local id="$1"
    local ssid="$2"
    local psk="$3"
    local hidden="${4:-false}"
    local out_file="$ROOT_MNT/etc/NetworkManager/system-connections/${id}.nmconnection"

    cat >"$out_file" <<NMEOF
[connection]
id=${id}
uuid=$(uuidgen)
type=wifi
autoconnect=true

[wifi]
ssid=${ssid}
mode=infrastructure
hidden=${hidden}

[wifi-security]
key-mgmt=wpa-psk
psk=${psk}

[ipv4]
method=auto

[ipv6]
method=auto
NMEOF

    chmod 600 "$out_file"
}

set_wifi_country() {
    local country="$1"
    local crda_file="$ROOT_MNT/etc/default/crda"

    mkdir -p "$ROOT_MNT/etc/default"
    cat >"$crda_file" <<EOF
REGDOMAIN=${country}
EOF
}

set_cmdline_regdomain() {
    local country="$1"
    local cmdline_file="$BOOT_MNT/cmdline.txt"

    if [ ! -f "$cmdline_file" ]; then
        echo "Warning: $cmdline_file not found; skipping Wi-Fi country kernel arg."
        return
    fi

    sed -i \
        -e 's/[[:space:]]*cfg80211\.ieee80211_regdom=[^[:space:]]*//g' \
        -e "s/\(.*\)/\1 cfg80211.ieee80211_regdom=${country}/" \
        "$cmdline_file"
}

ensure_nm_wifi_enabled() {
    local nm_state="$ROOT_MNT/var/lib/NetworkManager/NetworkManager.state"
    local rfkill_dir="$ROOT_MNT/var/lib/systemd/rfkill"
    local f

    if [ -f "$nm_state" ]; then
        if grep -q '^WirelessEnabled=' "$nm_state"; then
            sed -i 's/^WirelessEnabled=.*/WirelessEnabled=true/' "$nm_state"
        else
            printf '\nWirelessEnabled=true\n' >> "$nm_state"
        fi
    fi

    if [ -d "$rfkill_dir" ]; then
        for f in "$rfkill_dir"/*; do
            [ -f "$f" ] || continue
            echo 0 > "$f"
        done
    fi
}

resolve_latest_lite_lts_image() {
    local images_url listing latest_dir dir_listing

    images_url="${RPI_DL_ROOT}/${LTS_SERIES}/images/"
    echo "Discovering latest Raspberry Pi OS Lite LTS image..."

    listing="$(wget -qO- "$images_url")" || {
        echo "Failed to fetch image index: $images_url"
        exit 1
    }

    latest_dir="$(printf '%s\n' "$listing" \
        | grep -oE "${LTS_SERIES}-[0-9]{4}-[0-9]{2}-[0-9]{2}/" \
        | tr -d '/' \
        | sort -u \
        | sort -V \
        | tail -n1)"

    if [ -z "$latest_dir" ]; then
        echo "Could not find a dated LTS release directory under $images_url"
        exit 1
    fi

    dir_listing="$(wget -qO- "${images_url}${latest_dir}/")" || {
        echo "Failed to fetch release directory: ${images_url}${latest_dir}/"
        exit 1
    }

    OS_FILE_XZ="$(printf '%s\n' "$dir_listing" \
        | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}-raspios-[^"/]*-arm64-lite\.img\.xz' \
        | sort -u \
        | sort -V \
        | tail -n1)"

    if [ -z "$OS_FILE_XZ" ]; then
        echo "Could not find an arm64 Lite image in ${images_url}${latest_dir}/"
        exit 1
    fi

    OS_FILE="${OS_FILE_XZ%.xz}"
    OS_URL="${images_url}${latest_dir}/${OS_FILE_XZ}"

    echo "Selected LTS image: $OS_FILE_XZ"
}

# Step 1: Check for OS image, download if missing
resolve_latest_lite_lts_image

if [ -f "$OS_FILE" ]; then
    echo "OS image ($OS_FILE) already exists, skipping download."
elif [ -f "$OS_FILE_XZ" ]; then
    echo "Compressed OS image ($OS_FILE_XZ) found, extracting..."
    xz -d "$OS_FILE_XZ" || { echo "Extraction failed"; exit 1; }
else
    echo "Downloading Raspberry Pi OS Lite..."
    wget -O "$OS_FILE_XZ" "$OS_URL" || { echo "Download failed"; exit 1; }
    echo "Extracting image..."
    xz -d "$OS_FILE_XZ" || { echo "Extraction failed"; exit 1; }
fi

# Step 2: Prompt for HiFiBerry board model
echo "Select HiFiBerry board model:"
echo " 1) DAC / DAC+ Light / DAC Zero / MiniAmp / Beocreate / DAC+ RTC"
echo " 2) DAC+ DSP"
echo " 3) DAC8x"
echo " 4) DAC+ Standard"
echo " 5) DAC+ Pro"
echo " 6) DAC2 Pro"
echo " 7) DAC+ ADC"
echo " 8) DAC+ ADC Pro"
echo " 9) DAC2 ADC Pro"
echo "10) DAC2 HD"
echo "11) Digi+ / Digi 2 Standard"
echo "12) Digi+ Pro / Digi 2 Pro"
echo "13) Amp+ (not Amp2)"
echo "14) Amp2"
echo "15) Amp3"
echo "16) Amp4"
echo "17) Amp4 Pro"

read -r -p "Enter number (1-17): " BOARD_CHOICE

case "$BOARD_CHOICE" in
    1) BOARD_MODEL="dac" ;;
    2) BOARD_MODEL="dacplusdsp" ;;
    3) BOARD_MODEL="dac8x" ;;
    4) BOARD_MODEL="dacplus-standard" ;;
    5) BOARD_MODEL="dacplus-pro" ;;
    6) BOARD_MODEL="dac2-pro" ;;
    7) BOARD_MODEL="dacplusadc" ;;
    8) BOARD_MODEL="dacplusadcpro" ;;
    9) BOARD_MODEL="dac2-adc-pro" ;;
    10) BOARD_MODEL="dac2-hd" ;;
    11) BOARD_MODEL="digi" ;;
    12) BOARD_MODEL="digi-pro" ;;
    13) BOARD_MODEL="amp" ;;
    14) BOARD_MODEL="amp2" ;;
    15) BOARD_MODEL="amp3" ;;
    16) BOARD_MODEL="amp4" ;;
    17) BOARD_MODEL="amp4pro" ;;
    *) echo "Invalid choice."; exit 1 ;;
esac

echo "Selected board model: $BOARD_MODEL"

# Step 3: Write image to SD card
echo "Writing image to $SD_DEVICE (this will erase all data)..."
read -r -p "Are you sure? (y/N) " -n 1 REPLY
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted by user."
    exit 1
fi

umount "$(get_part "$SD_DEVICE" 1)" "$(get_part "$SD_DEVICE" 2)" 2>/dev/null || true
dd if="$OS_FILE" of="$SD_DEVICE" bs=4M status=progress oflag=sync conv=fsync || { echo "Write failed"; exit 1; }
sync
partprobe "$SD_DEVICE" || true
udevadm settle
sleep 2

# Step 4: Mount partitions
echo "Mounting partitions..."
mkdir -p "$BOOT_MNT" "$ROOT_MNT"

BOOT_PART="$(get_part "$SD_DEVICE" 1)"
ROOT_PART="$(get_part "$SD_DEVICE" 2)"

mount "$BOOT_PART" "$BOOT_MNT" || { echo "Failed to mount $BOOT_PART"; exit 1; }
mount "$ROOT_PART" "$ROOT_MNT" || { echo "Failed to mount $ROOT_PART"; exit 1; }

# On current Raspberry Pi OS, the boot partition is mounted at /boot/firmware
# after first boot. While imaging offline, we edit that same partition directly.
CONFIG_TXT="$BOOT_MNT/config.txt"
if [ ! -f "$CONFIG_TXT" ]; then
    echo "Failed to locate config.txt on boot partition at $CONFIG_TXT"
    exit 1
fi

# Detect kernel version from the image and select overlay
IMAGE_KERNEL="$(detect_image_kernel)"
DAC_TYPE="$(overlay_for_board "$BOARD_MODEL" "$IMAGE_KERNEL")"

echo "Detected image kernel: $IMAGE_KERNEL"
echo "Using HiFiBerry overlay: $DAC_TYPE"

# Step 5: Configure boot partition
echo "Configuring boot partition..."
touch "$BOOT_MNT/ssh"
rm -f "$BOOT_MNT/firstrun.sh"
echo "${USER_NAME}:${PASS_HASH}" > "$BOOT_MNT/userconf.txt"

# Remove/replace settings we manage
sed -i '/^dtparam=audio=on$/d' "$CONFIG_TXT"
sed -i '/^#dtparam=audio=on$/d' "$CONFIG_TXT"
sed -i '/^dtoverlay=vc4-kms-v3d$/d' "$CONFIG_TXT"
sed -i '/^dtoverlay=vc4-kms-v3d,noaudio$/d' "$CONFIG_TXT"
sed -i '/^dtoverlay=vc4-fkms-v3d$/d' "$CONFIG_TXT"
sed -i '/^dtoverlay=vc4-fkms-v3d,audio=off$/d' "$CONFIG_TXT"
sed -i '/^dtoverlay=gpio-ir,gpio_pin=5$/d' "$CONFIG_TXT"
sed -i '/^dtoverlay=hifiberry-/d' "$CONFIG_TXT"

# Ensure SPI is enabled if present as commented line
sed -i 's/^#dtparam=spi=on/dtparam=spi=on/' "$CONFIG_TXT"

# Apply current HiFiBerry recommendations
cat >>"$CONFIG_TXT" <<EOF2

# Enable DRM VC4 V3D driver without onboard audio
dtoverlay=vc4-kms-v3d,noaudio

# Enable IR on pins the HiFiBerry doesn't use
dtoverlay=gpio-ir,gpio_pin=5

# HiFiBerry overlay selected from board model + image kernel
dtoverlay=${DAC_TYPE}
EOF2

# Set WLAN regulatory domain so dual-band Wi-Fi is usable on first boot
set_cmdline_regdomain "US"
set_wifi_country "US"

# Step 6: Configure root filesystem
echo "Configuring root filesystem..."

# Set hostname
echo "$HOSTNAME" > "$ROOT_MNT/etc/hostname"
sed -i "s/raspberrypi/$HOSTNAME/g" "$ROOT_MNT/etc/hosts" 2>/dev/null || true

# Rename 'pi' user/group to 'michael' to preserve default Raspberry Pi OS setup
if grep -q '^pi:' "$ROOT_MNT/etc/passwd"; then
    # passwd: rename user and home path
    sed -i \
        -e "s/^pi:/${USER_NAME}:/" \
        -e "s#:/home/pi:#:/home/${USER_NAME}:#" \
        "$ROOT_MNT/etc/passwd"

    # shadow: rename user and replace password hash
    sed -i \
        -e "s/^pi:/${USER_NAME}:/" \
        -e "s#^${USER_NAME}:[^:]*:#${USER_NAME}:${PASS_HASH}:#" \
        "$ROOT_MNT/etc/shadow"

    # group: rename primary group
    sed -i "s/^pi:/${USER_NAME}:/" "$ROOT_MNT/etc/group"

    # Update supplemental group memberships from pi -> michael
    awk -F: -v old="pi" -v new="$USER_NAME" '
    BEGIN { OFS=FS }
    {
        if ($4 != "") {
            n = split($4, a, ",")
            for (i = 1; i <= n; i++) {
                if (a[i] == old) a[i] = new
            }
            $4 = a[1]
            for (i = 2; i <= n; i++) $4 = $4 "," a[i]
        }
        print
    }' "$ROOT_MNT/etc/group" > "$ROOT_MNT/etc/group.tmp" && mv "$ROOT_MNT/etc/group.tmp" "$ROOT_MNT/etc/group"

    # Rename home directory if present
    if [ -d "$ROOT_MNT/home/pi" ]; then
        mv "$ROOT_MNT/home/pi" "$ROOT_MNT/home/$USER_NAME"
    fi
else
    # Fallback if future image no longer has pi
    echo "${USER_NAME}:x:1000:1000:${USER_NAME},,,:/home/${USER_NAME}:/bin/bash" >> "$ROOT_MNT/etc/passwd"
    echo "${USER_NAME}:x:1000:" >> "$ROOT_MNT/etc/group"
    echo "${USER_NAME}:${PASS_HASH}:19255:0:99999:7:::" >> "$ROOT_MNT/etc/shadow"
    mkdir -p "$ROOT_MNT/home/${USER_NAME}"
fi

# Ensure home and SSH key
mkdir -p "$ROOT_MNT/home/$USER_NAME/.ssh"
echo "$SSH_KEY" > "$ROOT_MNT/home/$USER_NAME/.ssh/authorized_keys"
chmod 700 "$ROOT_MNT/home/$USER_NAME/.ssh"
chmod 600 "$ROOT_MNT/home/$USER_NAME/.ssh/authorized_keys"
chown -R 1000:1000 "$ROOT_MNT/home/$USER_NAME"

# Ensure michael is in audio group
ensure_group_member "audio" "$USER_NAME" "$ROOT_MNT/etc/group"

# Passwordless sudo
echo "$USER_NAME ALL=(ALL) NOPASSWD: ALL" > "$ROOT_MNT/etc/sudoers.d/010_michael-nopasswd"
chmod 440 "$ROOT_MNT/etc/sudoers.d/010_michael-nopasswd"

# Disable password auth for SSH (key-only)
sed -i '/^#PasswordAuthentication yes/s/^#//' "$ROOT_MNT/etc/ssh/sshd_config"
sed -i '/^PasswordAuthentication yes/s/yes/no/' "$ROOT_MNT/etc/ssh/sshd_config"

# Configure Wi-Fi with NetworkManager (Raspberry Pi OS Bookworm)
echo "Configuring Wi-Fi with NetworkManager..."
mkdir -p "$ROOT_MNT/etc/NetworkManager/system-connections"
write_nm_connection "mikeszila5G" "mikeszila5G" "youhavetobuyadrinkfirst" "true"
#write_nm_connection "HonestControls" "HonestControls" "hchello123" "false"
ensure_nm_wifi_enabled

# Set timezone
rm -f "$ROOT_MNT/etc/localtime"
ln -sf /usr/share/zoneinfo/America/New_York "$ROOT_MNT/etc/localtime"
echo "America/New_York" > "$ROOT_MNT/etc/timezone"

# Set keyboard
cat >"$ROOT_MNT/etc/default/keyboard" <<'KBEOF'
XKBMODEL="pc105"
XKBLAYOUT="us"
XKBVARIANT=""
XKBOPTIONS=""
KBEOF

# Step 7: Unmount
echo "Unmounting partitions..."
umount -l "$BOOT_MNT" "$ROOT_MNT"
rmdir "$BOOT_MNT" "$ROOT_MNT"
sync

trap - EXIT
echo "SD card ready! Insert into RPi and boot."
