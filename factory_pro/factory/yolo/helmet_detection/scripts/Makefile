TARGET = librknn_api.so
CC = gcc
AR = ar

CROSS_COMPILE ?= aarch64-openharmony-linux-gnu-

SRCS = v4l2_capture.c
OBJS = $(SRCS:.c=.o)

CFLAGS = -Wall -Wextra -fPIC
CFLAGS += -I$(RKNN_LIB_DIR)/include
LDFLAGS = -L$(RKNN_LIB_DIR)/lib -lrknn_api

ifeq ($(CROSS_COMPILE),)
    CC := gcc
    AR := ar
else
    CC := $(CROSS_COMPILE)gcc
    AR := $(CROSS_COMPILE)ar
endif

all: v4l2_capture.a

v4l2_capture.a: $(OBJS)
	$(AR) rcs $@ $(OBJS)
	@echo "Built $@ for target architecture"

%.o: %.c v4l2_capture.h
	$(CC) $(CFLAGS) -c $< -o $@
	@echo "Compiled $<"

clean:
	rm -f $(OBJS) v4l2_capture.a

.PHONY: all clean