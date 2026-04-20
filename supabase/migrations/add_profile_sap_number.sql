-- SAP employee number (Оюу Толгой, Рио Тинто гэх мэт томоохон байгууллагад шаардлагатай)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sap_number text;

COMMENT ON COLUMN public.profiles.sap_number IS 'SAP ажилтны дугаар (Оюу Толгой, Рио Тинто Монгол гэх мэт байгууллагад хэрэглэгдэнэ).';
