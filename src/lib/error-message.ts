export function toMnErrorMessage(input?: string | null): string {
  if (!input) return "Системийн алдаа гарлаа. Дараа дахин оролдоно уу.";
  const msg = input.toLowerCase();

  if (msg.includes("duplicate") || msg.includes("already exists")) {
    return "Ижил мэдээлэл бүртгэлтэй байна.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid_credentials")) {
    return "Нэвтрэх мэдээлэл буруу байна.";
  }
  if (msg.includes("permission") || msg.includes("forbidden") || msg.includes("not allowed")) {
    return "Энэ үйлдлийг хийх эрх хүрэлцэхгүй байна.";
  }
  if (msg.includes("not configured") || msg.includes("service role")) {
    return "Серверийн тохиргоо дутуу байна.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Сүлжээний алдаа гарлаа. Дахин оролдоно уу.";
  }

  return "Үйлдэл гүйцэтгэх үед алдаа гарлаа. Дахин оролдоно уу.";
}

