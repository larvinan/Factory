#ifndef V4L2_CAPTURE_H
#define V4L2_CAPTURE_H

#ifdef __cplusplus
extern "C" {
#endif

int v4l2_capture_init(const char *device, int width, int height, int fps);

int v4l2_capture_frame(unsigned char **yuyv_data, size_t *data_size);

void v4l2_capture_deinit(void);

void yuyv_to_rgb(const unsigned char *yuyv, unsigned char *rgb, int width, int height);

#ifdef __cplusplus
}
#endif

#endif