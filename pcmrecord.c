/* 
  A Minimal Capture Program
  This program opens an audio interface for capture, configures it for
  stereo, 16 bit, 44.1kHz, interleaved conventional read/write
  access. Then its reads a chunk of random data from it, and exits. It
  isn't meant to be a real program.
  From on Paul David's tutorial : http://equalarea.com/paul/alsa-audio.html
  Fixes rate and buffer problems
  sudo apt-get install libasound2-dev
  gcc -o alsa-record-example -lasound alsa-record-example.c && ./alsa-record-example hw:0
*/

#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <alsa/asoundlib.h>

int main(int argc, char *argv[])

{
  snd_htimestamp_t trigger_tstamp, htstamp;

  int err, read_count;
  unsigned int reported_period_time, reported_rate, buff_size, index, totalLength, statusLength, rate, channels, buffer_size, buffer_alloc_size, avail;

  char *buffer;

  snd_pcm_t *capture_handle;
  snd_pcm_hw_params_t *hw_params;
  snd_pcm_sw_params_t *sw_params;
  snd_pcm_format_t format = SND_PCM_FORMAT_S16_LE;
  snd_pcm_uframes_t reported_buffer_size, period_size, reported_boundary, reported_period_size;

  snd_pcm_status_t *status;
  snd_pcm_audio_tstamp_config_t tstamp_config;

  snd_pcm_audio_tstamp_report_t tstamp_report;

  index = 0;

  rate = atoi(argv[2]);
  channels = atoi(argv[3]);
  period_size = atoi(argv[4]);
  buffer_size = atoi(argv[5]);

  if ((err = snd_pcm_open(&capture_handle, argv[1], SND_PCM_STREAM_CAPTURE, 0)) < 0)
  {
    fprintf(stderr, "cannot open audio device %s (%s)\n",
            argv[1],
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "audio interface opened\n");

  if ((err = snd_pcm_hw_params_malloc(&hw_params)) < 0)
  {
    fprintf(stderr, "cannot allocate hardware parameter structure (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "hw_params allocated\n");

  if ((err = snd_pcm_hw_params_any(capture_handle, hw_params)) < 0)
  {
    fprintf(stderr, "cannot initialize hardware parameter structure (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "hw_params initialized\n");

  if ((err = snd_pcm_hw_params_set_access(capture_handle, hw_params, SND_PCM_ACCESS_RW_INTERLEAVED)) < 0)
  {
    fprintf(stderr, "cannot set access type (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "hw_params access setted\n");

  if ((err = snd_pcm_hw_params_set_format(capture_handle, hw_params, format)) < 0)
  {
    fprintf(stderr, "cannot set sample format (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "hw_params format setted\n");

  if ((err = snd_pcm_hw_params_set_rate_near(capture_handle, hw_params, &rate, 0)) < 0)
  {
    fprintf(stderr, "cannot set sample rate (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "hw_params rate setted\n");

  fprintf(stderr, "Setup Period Size: %d\n", period_size);

  if (err = snd_pcm_hw_params_set_period_size(capture_handle, hw_params, period_size, 0) < 0)
    fprintf(stderr, "ERROR: Can't set Period size. %s\n", snd_strerror(err));

  fprintf(stderr, "hw_params Period Size setted\n");

  fprintf(stderr, "Setup Buffer Size: %d\n", buffer_size);

  if (err = snd_pcm_hw_params_set_buffer_size(capture_handle, hw_params, buffer_size) < 0)
    fprintf(stderr, "ERROR: Can't set Buffer size. %s\n", snd_strerror(err));

  fprintf(stderr, "hw_params Buffer Size setted\n");

  if (err = snd_pcm_hw_params_set_channels(capture_handle, hw_params, channels) < 0)
    fprintf(stderr, "ERROR: Can't set channels number. %s\n", snd_strerror(err));

  fprintf(stderr, "hw_params channels setted\n");

  if ((err = snd_pcm_hw_params(capture_handle, hw_params)) < 0)
  {
    fprintf(stderr, "cannot set parameters (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "hw_params setted\n");

  snd_pcm_sw_params_alloca(&sw_params);

  err = snd_pcm_sw_params_current(capture_handle, sw_params);
  if (err < 0)
  {
    fprintf(stderr, "Unable to determine current sw_params for %s: %s\n", 999, snd_strerror(err));
    return err;
  }

  if (err = snd_pcm_sw_params_set_tstamp_mode(capture_handle, sw_params, SND_PCM_TSTAMP_ENABLE) < 0)
    fprintf(stderr, "ERROR: Can't set tstamp_mode. %s\n", snd_strerror(err));

  if (err = snd_pcm_sw_params_set_tstamp_type(capture_handle, sw_params, SND_PCM_TSTAMP_TYPE_GETTIMEOFDAY) < 0)
    fprintf(stderr, "ERROR: Can't set tstamp_type. %s\n", snd_strerror(err));

  err = snd_pcm_sw_params(capture_handle, sw_params);
  if (err < 0)
  {
    fprintf(stderr, "Unable to set sw params for %s: %s\n", 999, snd_strerror(err));
    return err;
  }

  if ((err = snd_pcm_prepare(capture_handle)) < 0)
  {
    fprintf(stderr, "cannot prepare audio interface for use (%s)\n",
            snd_strerror(err));
    exit(1);
  }

  fprintf(stderr, "audio interface prepared\n");

  snd_pcm_status_alloca(&status);

  if ((err = snd_pcm_status(capture_handle, status)) < 0)
  {
    fprintf(stderr, "Stream status error: %s\n", snd_strerror(err));
    exit(0);
  }

  tstamp_config.type_requested = 2;
  tstamp_config.report_delay = 1;

  snd_pcm_status_set_audio_htstamp_config(status, &tstamp_config);

  snd_pcm_hw_params_get_period_size(hw_params, &reported_period_size, 0);

  snd_pcm_hw_params_get_buffer_size(hw_params, &reported_buffer_size);

  snd_pcm_sw_params_get_boundary(sw_params, &reported_boundary);

  snd_pcm_hw_params_get_period_time(hw_params, &reported_period_time, 0);

  snd_pcm_hw_params_get_rate(hw_params, &reported_rate, 0);

  snd_pcm_hw_params_free(hw_params);

  fprintf(stderr, "hw_params freed\n");

  //snd_pcm_sw_params_free(sw_params);

  // fprintf(stderr, "sw_params freed\n");

  fprintf(stderr, "PCM name: '%s'\n", snd_pcm_name(capture_handle));
  fprintf(stderr, "PCM state: %s\n", snd_pcm_state_name(snd_pcm_state(capture_handle)));

  fprintf(stderr, "Rate: %d\n", reported_rate);
  fprintf(stderr, "Period Size: %d\n", reported_period_size);
  fprintf(stderr, "Buffer Size: %d\n", reported_buffer_size);
  fprintf(stderr, "Boundary Size: %d\n", reported_boundary);
  fprintf(stderr, "Period Time: %d\n", reported_period_time);

  buffer_alloc_size = reported_period_size * snd_pcm_format_width(format) / 8 * 2;

  fprintf(stderr, "Buffer Size Allocate %d\n", buffer_alloc_size);

  buffer = malloc(buffer_alloc_size);

  fprintf(stderr, "buffer allocated\n");

  char *statusData = NULL;

  while (1)
  {
    read_count = snd_pcm_readi(capture_handle, buffer, period_size);

    if (read_count == -EPIPE)
    {
      fprintf(stderr, "XRUN.\n");
      snd_pcm_prepare(capture_handle);
    }

    if (read_count > 0)
    {

      if ((err = snd_pcm_status(capture_handle, status)) < 0)
      {
        fprintf(stderr, "Stream status error: %s\n", snd_strerror(err));
        exit(0);
      }

      snd_pcm_status_get_trigger_htstamp(status, &trigger_tstamp);
      snd_pcm_status_get_htstamp(status, &htstamp);

      statusLength = asprintf(&statusData,
                              "\nRead: %d Index: %d Trigger: %lld.%.9ld htstamp: %lld.%.9ld Avail: %d Delay: %d State: %s END\n",
                              read_count,
                              index,
                              (long long)trigger_tstamp.tv_sec, trigger_tstamp.tv_nsec,
                              (long long)htstamp.tv_sec, htstamp.tv_nsec,
                              snd_pcm_status_get_avail(status),
                              snd_pcm_status_get_delay(status),
                              snd_pcm_state_name(snd_pcm_status_get_state(status)));

      char *str3 = (char *)malloc(statusLength + (read_count * 4));
      memcpy(str3, statusData, statusLength);
      memcpy(str3 + statusLength, buffer, read_count * 4);
      //printf("%s", str3);

      fwrite(str3, statusLength + (read_count * 4), 1, stdout);
      //fwrite(buffer, read_count * 4, 1, stdout);
      fflush(stdout);
      free(str3);

      index = index + 1;
    }
  }

  free(buffer);

  fprintf(stderr, "buffer freed\n");

  snd_pcm_close(capture_handle);
  fprintf(stderr, "audio interface closed\n");

  exit(0);
}