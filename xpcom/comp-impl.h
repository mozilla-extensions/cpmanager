#ifndef __SPECIALTHING_IMPL_H__
#define __SPECIALTHING_IMPL_H__

#include "windows.h"
#include "comp.h"
#include "nsStringAPI.h"

#define UIDGENERATOR_CONTRACTID "@mozillaonline.com/uidgenerator;1"
#define UIDGENERATOR_CLASSNAME "UidGenerator"
//5f31e2b0-d6dd-415d-9ce8-3e17d12dadac
#define UIDGENERATOR_CID { 0x5f31e2b0, 0xd6dd, 0x415d, { 0x9c, 0xe8, 0x3e, 0x17, 0xd1, 0x2d, 0xad, 0xac } }

class CUidGenerator : public IUidGenerator
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_IUIDGENERATOR

  CUidGenerator();
  BOOL getMacByCmd(char *lpszMac, int length);
  BOOL getCPUID(char *lpszCPUID, int length);
  BOOL getHDSN(char *lpszHDSN, int length);

private:
  ~CUidGenerator();

protected:
  /* additional members */
};

#endif