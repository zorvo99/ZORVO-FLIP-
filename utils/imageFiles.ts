/** Same limit as existing room / walkthrough photo handlers (2MB). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Encode image files as base64 data URLs. Validates size before reading.
 * @throws Error with message suitable for UI if any file exceeds MAX_IMAGE_BYTES.
 */
export async function filesToBase64DataUrls(files: File[]): Promise<string[]> {
  const oversized = files.find(f => f.size > MAX_IMAGE_BYTES);
  if (oversized) {
    throw new Error('Photo too large. Use images under 2MB.');
  }
  return Promise.all(
    files.map(
      file =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Could not read image.'));
          reader.readAsDataURL(file);
        })
    )
  );
}
