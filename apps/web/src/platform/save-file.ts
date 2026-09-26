function anchorDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/**
 * Touch devices get the system share sheet (Files, Drive, messengers), where a plain download is
 * awkward or unavailable. Must be called synchronously from a user gesture.
 */
export function saveFile(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function') {
    const file = new File([blob], name, { type });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) anchorDownload(blob, name);
      });
      return;
    }
  }
  anchorDownload(blob, name);
}
