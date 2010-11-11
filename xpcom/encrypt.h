#ifndef Encrypt_H_
#define Encrypt_H_

#include "des.h"
#include "base64.h"
class Encrypt{
public :    
    char* encrypt ( unsigned char ks[24], unsigned char iv[8], const char* data, int length);
    char* decrypt ( unsigned char ks[24], unsigned char iv[8], const char* data);
    CBase64 base;
	bool pkcs5_pad(unsigned char* buffer, int length);
	bool pkcs5_unpad(unsigned char* buffer, int length);
private :
	BYTE buffer[256];
};

#endif