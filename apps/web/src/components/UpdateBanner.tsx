import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { confirmLeave } from '../platform/leave-guard';
/** A new version is applied only when the user chooses, so an experiment is never reloaded mid-way. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (needRefresh)
    return (
      <div className="update-banner" role="status">
        <RefreshCw size={18} />
        <span>
          Доступна новая версия. Обнови между опытами — несохранённые данные не переносятся.
        </span>
        <button
          className="secondary"
          onClick={() => {
            if (confirmLeave()) void updateServiceWorker(true);
          }}
        >
          Обновить
        </button>
        <button className="icon-button" aria-label="Позже" onClick={() => setNeedRefresh(false)}>
          <X size={16} />
        </button>
      </div>
    );
  if (offlineReady)
    return (
      <div className="update-banner" role="status">
        <WifiOff size={18} />
        <span>
          Приложение сохранено на устройстве: опыты, анализ и дневник работают без интернета.
        </span>
        <button className="icon-button" aria-label="Понятно" onClick={() => setOfflineReady(false)}>
          <X size={16} />
        </button>
      </div>
    );
  return null;
}
