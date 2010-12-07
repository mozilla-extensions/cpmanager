/*
 * DO NOT EDIT.  THIS FILE IS GENERATED FROM comp.idl
 */

#ifndef __gen_comp_h__
#define __gen_comp_h__


#ifndef __gen_nsISupports_h__
#include "nsISupports.h"
#endif

/* For IDL files that don't want to include root IDL files. */
#ifndef NS_NO_VTABLE
#define NS_NO_VTABLE
#endif

/* starting interface:    IUidGenerator */
#define IUIDGENERATOR_IID_STR "e2e98646-8d35-45aa-ba12-efca38052748"

#define IUIDGENERATOR_IID \
  {0xe2e98646, 0x8d35, 0x45aa, \
    { 0xba, 0x12, 0xef, 0xca, 0x38, 0x05, 0x27, 0x48 }}

class NS_NO_VTABLE NS_SCRIPTABLE IUidGenerator : public nsISupports {
 public: 

  NS_DECLARE_STATIC_IID_ACCESSOR(IUIDGENERATOR_IID)

  /* AString getID (); */
  NS_SCRIPTABLE NS_IMETHOD GetID(nsAString & _retval NS_OUTPARAM) = 0;

  /* AString getActivationKey (in wstring sn); */
  NS_SCRIPTABLE NS_IMETHOD GetActivationKey(const PRUnichar *sn, nsAString & _retval NS_OUTPARAM) = 0;

  /* AString getCommonAppdataFolder (); */
  NS_SCRIPTABLE NS_IMETHOD GetCommonAppdataFolder(nsAString & _retval NS_OUTPARAM) = 0;

};

  NS_DEFINE_STATIC_IID_ACCESSOR(IUidGenerator, IUIDGENERATOR_IID)

/* Use this macro when declaring classes that implement this interface. */
#define NS_DECL_IUIDGENERATOR \
  NS_SCRIPTABLE NS_IMETHOD GetID(nsAString & _retval NS_OUTPARAM); \
  NS_SCRIPTABLE NS_IMETHOD GetActivationKey(const PRUnichar *sn, nsAString & _retval NS_OUTPARAM); \
  NS_SCRIPTABLE NS_IMETHOD GetCommonAppdataFolder(nsAString & _retval NS_OUTPARAM); 

/* Use this macro to declare functions that forward the behavior of this interface to another object. */
#define NS_FORWARD_IUIDGENERATOR(_to) \
  NS_SCRIPTABLE NS_IMETHOD GetID(nsAString & _retval NS_OUTPARAM) { return _to GetID(_retval); } \
  NS_SCRIPTABLE NS_IMETHOD GetActivationKey(const PRUnichar *sn, nsAString & _retval NS_OUTPARAM) { return _to GetActivationKey(sn, _retval); } \
  NS_SCRIPTABLE NS_IMETHOD GetCommonAppdataFolder(nsAString & _retval NS_OUTPARAM) { return _to GetCommonAppdataFolder(_retval); } 

/* Use this macro to declare functions that forward the behavior of this interface to another object in a safe way. */
#define NS_FORWARD_SAFE_IUIDGENERATOR(_to) \
  NS_SCRIPTABLE NS_IMETHOD GetID(nsAString & _retval NS_OUTPARAM) { return !_to ? NS_ERROR_NULL_POINTER : _to->GetID(_retval); } \
  NS_SCRIPTABLE NS_IMETHOD GetActivationKey(const PRUnichar *sn, nsAString & _retval NS_OUTPARAM) { return !_to ? NS_ERROR_NULL_POINTER : _to->GetActivationKey(sn, _retval); } \
  NS_SCRIPTABLE NS_IMETHOD GetCommonAppdataFolder(nsAString & _retval NS_OUTPARAM) { return !_to ? NS_ERROR_NULL_POINTER : _to->GetCommonAppdataFolder(_retval); } 

#if 0
/* Use the code below as a template for the implementation class for this interface. */

/* Header file */
class _MYCLASS_ : public IUidGenerator
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_IUIDGENERATOR

  _MYCLASS_();

private:
  ~_MYCLASS_();

protected:
  /* additional members */
};

/* Implementation file */
NS_IMPL_ISUPPORTS1(_MYCLASS_, IUidGenerator)

_MYCLASS_::_MYCLASS_()
{
  /* member initializers and constructor code */
}

_MYCLASS_::~_MYCLASS_()
{
  /* destructor code */
}

/* AString getID (); */
NS_IMETHODIMP _MYCLASS_::GetID(nsAString & _retval NS_OUTPARAM)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

/* AString getActivationKey (in wstring sn); */
NS_IMETHODIMP _MYCLASS_::GetActivationKey(const PRUnichar *sn, nsAString & _retval NS_OUTPARAM)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

/* AString getCommonAppdataFolder (); */
NS_IMETHODIMP _MYCLASS_::GetCommonAppdataFolder(nsAString & _retval NS_OUTPARAM)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

/* End of implementation class template. */
#endif


#endif /* __gen_comp_h__ */
