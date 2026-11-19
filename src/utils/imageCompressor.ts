/**
 * Compresses any image file or data URL into a lightweight, high-performance avatar
 * suitable for real-time WebSocket, MQTT, and local storage (typically 8-15 KB).
 */
export function compressAvatarImage(
  source: File | string,
  maxDimension = 180,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    // If it's a remote URL (http/https), keep it directly
    if (typeof source === 'string' && /^https?:\/\//i.test(source.trim())) {
      resolve(source.trim());
      return;
    }

    const processDataUrl = (dataUrl: string) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          canvas.width = Math.max(32, width);
          canvas.height = Math.max(32, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };

      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };

    if (typeof source === 'string') {
      processDataUrl(source);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          processDataUrl(result);
        } else {
          resolve('');
        }
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(source);
    }
  });
}
