import { useEffect, useMemo, useState } from 'react';

type ActionType = 'save' | 'logout' | 'delete';

interface ActionConfig {
  type: ActionType;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
}

const actionConfigMap: Record<ActionType, ActionConfig> = {
  save: {
    type: 'save',
    title: 'Confirm Save',
    message: 'Are you sure you want to save these changes?',
    confirmLabel: 'Yes, Save',
    confirmClass: 'bg-amber-500 hover:bg-amber-400 text-black',
  },
  logout: {
    type: 'logout',
    title: 'Confirm Logout',
    message: 'Are you sure you want to log out now?',
    confirmLabel: 'Yes, Logout',
    confirmClass: 'bg-red-600 hover:bg-red-500 text-white',
  },
  delete: {
    type: 'delete',
    title: 'Confirm Delete',
    message: 'Are you sure you want to delete this item? This action cannot be undone.',
    confirmLabel: 'Yes, Delete',
    confirmClass: 'bg-red-600 hover:bg-red-500 text-white',
  },
};

const findActionType = (text: string): ActionType | null => {
  if (/\bdelete\b/i.test(text)) return 'delete';
  if (/\blogout\b|\bsign\s*out\b|\blog\s*out\b/i.test(text)) return 'logout';
  if (/\bsave\b|\bsubmit\b/i.test(text)) return 'save';
  return null;
};

const resolveActionType = (element: HTMLElement): ActionType | null => {
  const explicit = element.getAttribute('data-confirm-action')?.toLowerCase();
  if (explicit === 'save' || explicit === 'logout' || explicit === 'delete') {
    return explicit;
  }

  if (element.getAttribute('data-no-global-confirm') === 'true') return null;

  const text = [
    element.textContent || '',
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.getAttribute('value') || '',
  ]
    .join(' ')
    .trim();

  return findActionType(text);
};

export const GlobalActionConfirmation: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<HTMLElement | null>(null);
  const [pendingType, setPendingType] = useState<ActionType>('save');

  const activeConfig = useMemo(() => actionConfigMap[pendingType], [pendingType]);

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const clicked = event.target as HTMLElement | null;
      if (!clicked) return;

      const target = clicked.closest('button,[role="button"],input[type="button"],input[type="submit"]') as HTMLElement | null;
      if (!target) return;

      if (target.getAttribute('data-no-global-confirm') === 'true') return;
      if (target.getAttribute('data-confirm-bypass') === 'true') {
        target.removeAttribute('data-confirm-bypass');
        return;
      }
      if (target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;

      const actionType = resolveActionType(target);
      if (!actionType) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      setPendingTarget(target);
      setPendingType(actionType);
      setIsOpen(true);
      setIsConfirming(false);
    };

    document.addEventListener('click', handleGlobalClick, true);
    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
    };
  }, []);

  const closeDialog = () => {
    if (isConfirming) return;
    setIsOpen(false);
    setPendingTarget(null);
  };

  const confirmAction = async () => {
    if (!pendingTarget || isConfirming) return;
    setIsConfirming(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (pendingTarget.isConnected) {
      pendingTarget.setAttribute('data-confirm-bypass', 'true');
      pendingTarget.click();
    }

    setIsConfirming(false);
    setIsOpen(false);
    setPendingTarget(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={closeDialog}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{activeConfig.title}</h3>
        <p className="text-sm text-gray-600 mb-6">{activeConfig.message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            data-no-global-confirm="true"
            disabled={isConfirming}
            onClick={closeDialog}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-no-global-confirm="true"
            disabled={isConfirming}
            onClick={confirmAction}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center gap-2 ${activeConfig.confirmClass}`}
          >
            {isConfirming ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              activeConfig.confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
