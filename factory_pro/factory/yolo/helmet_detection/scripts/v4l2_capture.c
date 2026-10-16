#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/videodev2.h>

#define DEVICE_PATH "/dev/video0"
#define BUFFER_COUNT 4

struct buffer {
    void *start;
    size_t length;
};

static int fd = -1;
static struct buffer *buffers = NULL;
static int buffer_count = 0;

static int xioctl(int fh, int request, void *arg) {
    int r;
    do {
        r = ioctl(fh, request, arg);
    } while (-1 == r && EINTR == errno);
    return r;
}

static int init_device(const char *device, int width, int height, int fps) {
    struct v4l2_capability cap;
    struct v4l2_format fmt;
    struct v4l2_streamparm stream_parm;
    
    fd = open(device, O_RDWR | O_NONBLOCK, 0);
    if (-1 == fd) {
        perror("Cannot open device");
        return -1;
    }
    
    if (-1 == xioctl(fd, VIDIOC_QUERYCAP, &cap)) {
        perror("VIDIOC_QUERYCAP");
        return -1;
    }
    
    if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
        fprintf(stderr, "Device is not a video capture device\n");
        return -1;
    }
    
    if (!(cap.capabilities & V4L2_CAP_STREAMING)) {
        fprintf(stderr, "Device does not support streaming\n");
        return -1;
    }
    
    memset(&fmt, 0, sizeof(fmt));
    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    fmt.fmt.pix.width = width;
    fmt.fmt.pix.height = height;
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;
    fmt.fmt.pix.field = V4L2_FIELD_INTERLACED;
    
    if (-1 == xioctl(fd, VIDIOC_S_FMT, &fmt)) {
        perror("VIDIOC_S_FMT");
        return -1;
    }
    
    if (fmt.fmt.pix.pixelformat != V4L2_PIX_FMT_YUYV) {
        fprintf(stderr, "YUYV format not supported\n");
        return -1;
    }
    
    memset(&stream_parm, 0, sizeof(stream_parm));
    stream_parm.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    stream_parm.parm.capture.timeperframe.numerator = 1;
    stream_parm.parm.capture.timeperframe.denominator = fps;
    
    if (-1 == xioctl(fd, VIDIOC_S_PARM, &stream_parm)) {
        perror("VIDIOC_S_PARM");
        return -1;
    }
    
    return 0;
}

static int init_mmap(void) {
    struct v4l2_requestbuffers req;
    
    memset(&req, 0, sizeof(req));
    req.count = BUFFER_COUNT;
    req.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    req.memory = V4L2_MEMORY_MMAP;
    
    if (-1 == xioctl(fd, VIDIOC_REQBUFS, &req)) {
        perror("VIDIOC_REQBUFS");
        return -1;
    }
    
    buffers = calloc(req.count, sizeof(struct buffer));
    if (!buffers) {
        fprintf(stderr, "Out of memory\n");
        return -1;
    }
    
    for (buffer_count = 0; buffer_count < req.count; ++buffer_count) {
        struct v4l2_buffer buf;
        
        memset(&buf, 0, sizeof(buf));
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = buffer_count;
        
        if (-1 == xioctl(fd, VIDIOC_QUERYBUF, &buf)) {
            perror("VIDIOC_QUERYBUF");
            return -1;
        }
        
        buffers[buffer_count].length = buf.length;
        buffers[buffer_count].start = mmap(NULL, buf.length,
            PROT_READ | PROT_WRITE, MAP_SHARED, fd, buf.m.offset);
        
        if (MAP_FAILED == buffers[buffer_count].start) {
            perror("mmap");
            return -1;
        }
    }
    
    return 0;
}

static int start_capturing(void) {
    unsigned int i;
    enum v4l2_buf_type type;
    
    for (i = 0; i < buffer_count; ++i) {
        struct v4l2_buffer buf;
        
        memset(&buf, 0, sizeof(buf));
        buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buf.memory = V4L2_MEMORY_MMAP;
        buf.index = i;
        
        if (-1 == xioctl(fd, VIDIOC_QBUF, &buf)) {
            perror("VIDIOC_QBUF");
            return -1;
        }
    }
    
    type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (-1 == xioctl(fd, VIDIOC_STREAMON, &type)) {
        perror("VIDIOC_STREAMON");
        return -1;
    }
    
    return 0;
}

static int stop_capturing(void) {
    enum v4l2_buf_type type;
    
    type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (-1 == xioctl(fd, VIDIOC_STREAMOFF, &type)) {
        perror("VIDIOC_STREAMOFF");
        return -1;
    }
    
    return 0;
}

static void uninit_device(void) {
    unsigned int i;
    
    for (i = 0; i < buffer_count; ++i) {
        if (-1 == munmap(buffers[i].start, buffers[i].length)) {
            perror("munmap");
        }
    }
    
    free(buffers);
    
    if (-1 == close(fd)) {
        perror("close");
    }
    
    fd = -1;
}

static int read_frame(unsigned char **frame_data, size_t *frame_size) {
    struct v4l2_buffer buf;
    fd_set fds;
    struct timeval tv;
    int r;
    
    FD_ZERO(&fds);
    FD_SET(fd, &fds);
    
    tv.tv_sec = 2;
    tv.tv_usec = 0;
    
    r = select(fd + 1, &fds, NULL, NULL, &tv);
    
    if (-1 == r) {
        perror("select");
        return -1;
    }
    
    if (0 == r) {
        fprintf(stderr, "select timeout\n");
        return -1;
    }
    
    memset(&buf, 0, sizeof(buf));
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;
    
    if (-1 == xioctl(fd, VIDIOC_DQBUF, &buf)) {
        perror("VIDIOC_DQBUF");
        return -1;
    }
    
    *frame_data = (unsigned char *)buffers[buf.index].start;
    *frame_size = buf.bytesused;
    
    if (-1 == xioctl(fd, VIDIOC_QBUF, &buf)) {
        perror("VIDIOC_QBUF");
        return -1;
    }
    
    return 0;
}

void yuyv_to_rgb(const unsigned char *yuyv, unsigned char *rgb, int width, int height) {
    int i, j;
    int y0, y1, cb, cr;
    int r, g, b;
    
    for (i = 0; i < height; ++i) {
        for (j = 0; j < width; j += 2) {
            int yuyv_idx = i * width * 2 + j * 2;
            int rgb_idx = i * width * 3 + j * 3;
            
            y0 = yuyv[yuyv_idx];
            cb = yuyv[yuyv_idx + 1];
            y1 = yuyv[yuyv_idx + 2];
            cr = yuyv[yuyv_idx + 3];
            
            cb -= 128;
            cr -= 128;
            
            r = y0 + (454 * cr) / 256;
            g = y0 - (88 * cb + 183 * cr) / 256;
            b = y0 + (359 * cb) / 256;
            
            rgb[rgb_idx] = (unsigned char)(r < 0 ? 0 : (r > 255 ? 255 : r));
            rgb[rgb_idx + 1] = (unsigned char)(g < 0 ? 0 : (g > 255 ? 255 : g));
            rgb[rgb_idx + 2] = (unsigned char)(b < 0 ? 0 : (b > 255 ? 255 : b));
            
            r = y1 + (454 * cr) / 256;
            g = y1 - (88 * cb + 183 * cr) / 256;
            b = y1 + (359 * cb) / 256;
            
            rgb[rgb_idx + 3] = (unsigned char)(r < 0 ? 0 : (r > 255 ? 255 : r));
            rgb[rgb_idx + 4] = (unsigned char)(g < 0 ? 0 : (g > 255 ? 255 : g));
            rgb[rgb_idx + 5] = (unsigned char)(b < 0 ? 0 : (b > 255 ? 255 : b));
        }
    }
}

#ifdef __cplusplus
extern "C" {
#endif

int v4l2_capture_init(const char *device, int width, int height, int fps) {
    if (init_device(device, width, height, fps) != 0) {
        return -1;
    }
    
    if (init_mmap() != 0) {
        uninit_device();
        return -1;
    }
    
    if (start_capturing() != 0) {
        uninit_device();
        return -1;
    }
    
    printf("V4L2 capture initialized: %s, %dx%d@%dfps\n", device, width, height, fps);
    return 0;
}

int v4l2_capture_frame(unsigned char **yuyv_data, size_t *data_size) {
    return read_frame(yuyv_data, data_size);
}

void v4l2_capture_deinit(void) {
    stop_capturing();
    uninit_device();
    printf("V4L2 capture deinitialized\n");
}

#ifdef __cplusplus
}
#endif

#ifdef TEST_MAIN
int main(int argc, char **argv) {
    const char *device = DEVICE_PATH;
    int width = 640;
    int height = 480;
    int fps = 30;
    
    if (argc >= 2) device = argv[1];
    if (argc >= 3) width = atoi(argv[2]);
    if (argc >= 4) height = atoi(argv[3]);
    if (argc >= 5) fps = atoi(argv[4]);
    
    if (v4l2_capture_init(device, width, height, fps) != 0) {
        fprintf(stderr, "Failed to initialize capture\n");
        return 1;
    }
    
    unsigned char *frame_data;
    size_t frame_size;
    
    int frame_count = 0;
    while (frame_count < 10) {
        if (v4l2_capture_frame(&frame_data, &frame_size) == 0) {
            printf("Frame %d: %zu bytes\n", frame_count, frame_size);
            frame_count++;
        }
        
        usleep(10000);
    }
    
    v4l2_capture_deinit();
    return 0;
}
#endif