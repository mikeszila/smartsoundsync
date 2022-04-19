#define _GNU_SOURCE
#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>

#include <string.h>
#include <unistd.h>

#include <fcntl.h>

#include <errno.h>

#define __STDC_FORMAT_MACROS
#include <inttypes.h>
#include <time.h>
#include <alsa/asoundlib.h>

int main(int argc, char **argv)
{

    struct timespec ts;

    int err, avail;

    fprintf(stderr, "HELLO!!!\n");
    unsigned int pcm, tmp, dir, reported_period_time, reported_rate, written, written2, statusLength, readLength, rate, channels, buffer_size, buff_size, bytesPerSample, bypesPerOutputSample, readTarget;

    snd_pcm_t *pcm_handle;
    snd_pcm_hw_params_t *hw_params;
    snd_pcm_uframes_t reported_period_size, reported_buffer_size, period_size, reported_boundary;
    snd_pcm_sw_params_t *sw_params;
    snd_htimestamp_t trigger_tstamp, htstamp;
    snd_pcm_status_t *status;
    snd_pcm_audio_tstamp_config_t tstamp_config;

    bytesPerSample = 2;

    if (argc < 4)
    {
        fprintf(stderr, "Usage: %s <sample_rate> <channels> <period_size> <buffer_size>\n",
                argv[0]);
        return -1;
    }

    rate = atoi(argv[2]);
    channels = atoi(argv[3]);
    period_size = atoi(argv[4]);
    buffer_size = atoi(argv[5]);

    bypesPerOutputSample = bytesPerSample * channels;

    /* Open the PCM device in playback mode */
    if (pcm = snd_pcm_open(&pcm_handle, argv[1],
                           SND_PCM_STREAM_PLAYBACK, 0) < 0)
        fprintf(stderr, "ERROR: Can't open \"%s\" PCM device. %s\n",
                argv[1], snd_strerror(pcm));

    /* Allocate parameters object and fill it with default values*/
    snd_pcm_hw_params_alloca(&hw_params);

    snd_pcm_hw_params_any(pcm_handle, hw_params);

    if (snd_pcm_hw_params_supports_audio_ts_type(hw_params, 0))
        fprintf(stderr, "Playback supports audio compat timestamps\n");
    if (snd_pcm_hw_params_supports_audio_ts_type(hw_params, 1))
        fprintf(stderr, "Playback supports audio default timestamps\n");
    if (snd_pcm_hw_params_supports_audio_ts_type(hw_params, 2))
        fprintf(stderr, "Playback supports audio link timestamps\n");
    if (snd_pcm_hw_params_supports_audio_ts_type(hw_params, 3))
        fprintf(stderr, "Playback supports audio link absolute timestamps\n");
    if (snd_pcm_hw_params_supports_audio_ts_type(hw_params, 4))
        fprintf(stderr, "Playback supports audio link estimated timestamps\n");
    if (snd_pcm_hw_params_supports_audio_ts_type(hw_params, 5))
        printf("Playback supports audio link synchronized timestamps\n");

    /* Set parameters */
    if (pcm = snd_pcm_hw_params_set_access(pcm_handle, hw_params,
                                           SND_PCM_ACCESS_RW_INTERLEAVED) < 0)
        fprintf(stderr, "ERROR: Can't set interleaved mode. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_hw_params_set_format(pcm_handle, hw_params,
                                           SND_PCM_FORMAT_S16_LE) < 0)
        fprintf(stderr, "ERROR: Can't set format. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_hw_params_set_channels(pcm_handle, hw_params, channels) < 0)
        fprintf(stderr, "ERROR: Can't set channels number. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_hw_params_set_rate(pcm_handle, hw_params, rate, 0) < 0)
        fprintf(stderr, "ERROR: Can't set rate. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_hw_params_set_period_size(pcm_handle, hw_params, period_size, 0) < 0)
        fprintf(stderr, "ERROR: Can't set Period size. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_hw_params_set_buffer_size(pcm_handle, hw_params, buffer_size) < 0)
        fprintf(stderr, "ERROR: Can't set Buffer size. %s\n", snd_strerror(pcm));

    /* Write parameters */
    if (pcm = snd_pcm_hw_params(pcm_handle, hw_params) < 0)
        fprintf(stderr, "ERROR: Can't set harware parameters. %s\n", snd_strerror(pcm));

    snd_pcm_sw_params_alloca(&sw_params);

    err = snd_pcm_sw_params_current(pcm_handle, sw_params);
    if (err < 0)
    {
        fprintf(stderr, "Unable to determine current sw_params for %s: %s\n", 999, snd_strerror(err));
        return err;
    }

    if (pcm = snd_pcm_sw_params_set_tstamp_mode(pcm_handle, sw_params, SND_PCM_TSTAMP_ENABLE) < 0)
        fprintf(stderr, "ERROR: Can't set tstamp_mode. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_sw_params_set_tstamp_type(pcm_handle, sw_params, SND_PCM_TSTAMP_TYPE_GETTIMEOFDAY) < 0)
        fprintf(stderr, "ERROR: Can't set tstamp_type. %s\n", snd_strerror(pcm));

    snd_pcm_sw_params_get_boundary(sw_params, &reported_boundary);

    /*  if (pcm = snd_pcm_sw_params_set_start_threshold(pcm_handle, sw_params, reported_boundary) < 0)
        fprintf(stderr, "ERROR: Can't set start_threshold. %s\n", snd_strerror(pcm));

    if (pcm = snd_pcm_sw_params_set_silence_threshold(pcm_handle, sw_params, reported_boundary) < 0)
        fprintf(stderr, "ERROR: Can't set silence_threshold. %s\n", snd_strerror(pcm));

    */

    err = snd_pcm_sw_params(pcm_handle, sw_params);
    if (err < 0)
    {
        fprintf(stderr, "Unable to set sw params for %s: %s\n", 999, snd_strerror(err));
        return err;
    }

    snd_pcm_hw_params_get_period_size(hw_params, &reported_period_size, 0);

    snd_pcm_hw_params_get_buffer_size(hw_params, &reported_buffer_size);

    snd_pcm_hw_params_get_period_time(hw_params, &reported_period_time, 0);

    snd_pcm_hw_params_get_rate(hw_params, &reported_rate, 0);

    fprintf(stderr, "PCM name: '%s'\n", snd_pcm_name(pcm_handle));

    fprintf(stderr, "PCM state: %s\n", snd_pcm_state_name(snd_pcm_state(pcm_handle)));

    snd_pcm_hw_params_get_channels(hw_params, &tmp);
    fprintf(stderr, "Channels: %i ", tmp);

    if (tmp == 1)
        fprintf(stderr, "(mono)\n");
    else if (tmp == 2)
        fprintf(stderr, "(stereo)\n");

    fprintf(stderr, "Rate: %d\n", reported_rate);
    fprintf(stderr, "Period Size: %d\n", reported_period_size);
    fprintf(stderr, "Buffer Size: %d\n", reported_buffer_size);
    fprintf(stderr, "Boundary Size: %d\n", reported_boundary);
    fprintf(stderr, "Period Time: %d\n", reported_period_time);

    char *buff;

    buff_size = reported_period_size * bypesPerOutputSample * 2 /* 2 -> sample size */;
    buff = (char *)malloc(buff_size);

    char *statusData = NULL;

    snd_pcm_status_alloca(&status);

    tstamp_config.type_requested = 2;
    tstamp_config.report_delay = 1;

    snd_pcm_status_set_audio_htstamp_config(status, &tstamp_config);

    readTarget = reported_period_size * bypesPerOutputSample * 2;

    while (1)
    {
        readLength = read(0, buff, readTarget);

        if (readLength < 0)
        {
            written = 0;
            fprintf(stderr, "Read Error: %s\n", snd_strerror(written));
            fflush(stderr);
        }

        readLength = readLength / bypesPerOutputSample;

        written = snd_pcm_writei(pcm_handle, buff, readLength);

        if (written == -EPIPE)
        {
            fprintf(stderr, "XRUN.\n");
            snd_pcm_prepare(pcm_handle);
        }

        if (written < 0)
        {
            fprintf(stderr, "ERROR. Can't write to PCM device. %s\n", snd_strerror(pcm));
        }

        if ((err = snd_pcm_status(pcm_handle, status)) < 0)
        {
            fprintf(stderr, "Stream status error: %s\n", snd_strerror(err));
        }
        avail = snd_pcm_status_get_avail(status);

        

        while (avail < reported_period_size && snd_pcm_status_get_state(status) == SND_PCM_STATE_RUNNING)
        {
            nanosleep((const struct timespec[]){{0, 100000}}, NULL);
            if ((err = snd_pcm_status(pcm_handle, status)) < 0)
            {
                fprintf(stderr, "Stream status error: %s\n", snd_strerror(err));
            }
            avail = snd_pcm_status_get_avail(status);
        }

        

        snd_pcm_status_get_trigger_htstamp(status, &trigger_tstamp);
        snd_pcm_status_get_htstamp(status, &htstamp);

        statusLength = asprintf(&statusData,
                                "Read: %d Written: %d Trigger: %lld.%.9ld htstamp: %lld.%.9ld Avail: %d Delay: %d State: %s \n",
                                readLength,
                                written,
                                (long long)trigger_tstamp.tv_sec, trigger_tstamp.tv_nsec,
                                (long long)htstamp.tv_sec, htstamp.tv_nsec,
                                avail,
                                snd_pcm_status_get_delay(status),
                                snd_pcm_state_name(snd_pcm_status_get_state(status)));

        fwrite(statusData, statusLength, 1, stdout);
        fflush(stdout);
    }

    snd_pcm_drain(pcm_handle);
    snd_pcm_close(pcm_handle);
    free(buff);


    return 0;
}
