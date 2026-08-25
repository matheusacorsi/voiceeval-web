import { uuid } from './utils.js';

// Abre a camera nativa do dispositivo via input[capture] (equivalente ao AddMedia com UseMobileCamera).
export function capturePhoto() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    document.body.appendChild(input);

    const cleanup = () => input.remove();

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      cleanup();
      if (!file) return reject(new Error('Nenhuma foto selecionada'));
      resolve({ id: uuid(), blob: file, mime: file.type || 'image/jpeg', timestamp: new Date().toISOString() });
    }, { once: true });

    input.addEventListener('cancel', () => {
      cleanup();
      reject(new Error('Captura de foto cancelada'));
    }, { once: true });

    input.click();
  });
}
