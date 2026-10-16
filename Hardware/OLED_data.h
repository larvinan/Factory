#ifndef __OLED_DATA_H
#define __OLED_DATA_H

#include <stdint.h>

/*字符集定义*/
/*以下两个宏定义只可解除其中一个的注释*/
#define OLED_CHARSET_UTF8			//定义字符集为UTF8
//#define OLED_CHARSET_GB2312		//定义字符集为GB2312

/*字模基本单元*/
typedef struct 
{
	
#ifdef OLED_CHARSET_UTF8			//定义字符集为UTF8
	char Index[5];					//汉字索引，空间为5字节
#endif
	
#ifdef OLED_CHARSET_GB2312			//定义字符集为GB2312
	char Index[3];					//汉字索引，空间为3字节
#endif
	
	uint8_t Data[32];				//字模数据
} ChineseCell_t;

/*ASCII字模数据声明*/
extern const uint8_t OLED_F8x16[][16];
extern const uint8_t OLED_F6x8[][6];

/*汉字字模数据声明*/
extern const ChineseCell_t OLED_CF16x16[];

/*图像数据声明*/
extern const uint8_t Diode[];//二极管
extern const uint8_t Dio[];//dick
extern const uint8_t xia[];//xxy
extern const uint8_t Lwh[];//Lwh
extern const uint8_t girl1[];//girl1
extern const unsigned char myBitmap1 [];
extern const unsigned char myBitmap2 [];
extern const unsigned char myBitmap3 [];
extern const unsigned char myBitmap4 [];
extern const unsigned char myBitmap5 [];
extern const unsigned char myBitmap6 [];
extern const unsigned char myBitmap7 [];
extern const unsigned char myBitmap8 [];
extern const unsigned char myBitmap9 [];
extern const unsigned char myBitmap10 [];
extern const unsigned char myBitmap11 [];
extern const unsigned char myBitmap12 [];
extern const unsigned char myBitmap13 [];
extern const unsigned char myBitmap14 [];
extern const unsigned char myBitmap15 [];
extern const unsigned char myBitmap16 [];
extern const unsigned char myBitmap17 [];
extern const unsigned char myBitmap18 [];
extern const unsigned char myBitmap19 [];
extern const unsigned char myBitmap20 [];
extern const unsigned char myBitmap21 [];
extern const unsigned char myBitmap22 [];
extern const unsigned char myBitmap23 [];
extern const unsigned char myBitmap24 [];
extern const unsigned char myBitmap25 [];
extern const unsigned char myBitmap26 [];
extern const unsigned char myBitmap27 [];
extern const unsigned char myBitmap28 [];
extern const unsigned char myBitmap29 [];
extern const unsigned char myBitmap30 [];
extern const unsigned char myBitmap31 [];
extern const unsigned char myBitmap32 [];
extern const unsigned char myBitmap33 [];
extern const unsigned char myBitmap34 [];
extern const unsigned char *ikun_table[34];
/*按照上面的格式，在这个位置加入新的图像数据声明*/
//...

#endif


/*****************江协科技|版权所有****************/
/*****************jiangxiekeji.com*****************/
