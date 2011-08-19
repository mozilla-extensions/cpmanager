#ifndef _CRYPTO_H_
#define _CRYPTO_H_

#include "des.h"

#ifdef __cplusplus
extern "C" {
#endif

bool
EncryptBufferCBC (unsigned __int32 *data, 
		 unsigned int len,
		 TDES_KEY *ks,
		 unsigned __int32 *iv);

bool
DecryptBufferCBC (unsigned __int32 *data,
		 unsigned int len,
		 TDES_KEY *ks,
		 unsigned __int32 *iv);

#ifdef __cplusplus
}
#endif

#endif