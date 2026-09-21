/**
 * Файлыг Cloudflare-ийн нэг удаагийн upload URL руу шууд илгээнэ.
 * fetch ашиглавал явцын хувь мэдэгдэхгүй тул XHR-ээр.
 */
export function uploadToCloudflare(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Cloudflare руу хуулахад алдаа гарлаа (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Сүлжээний алдаа — видео хуулж чадсангүй."));
    xhr.onabort = () => reject(new Error("Хуулалт цуцлагдлаа."));
    xhr.send(form);
  });
}
