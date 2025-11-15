import { useToast as useVueToast, POSITION } from 'vue-toastification';

export function useToast() {
  const toast = useVueToast();

  return {
    success: (message, options = {}) => {
      return toast.success(message, {
        timeout: 3000,
        position: POSITION.TOP_RIGHT,
        ...options
      });
    },
    error: (message, options = {}) => {
      return toast.error(message, {
        timeout: 4000,
        position: POSITION.TOP_RIGHT,
        ...options
      });
    },
    info: (message, options = {}) => {
      return toast.info(message, {
        timeout: 3000,
        position: POSITION.TOP_RIGHT,
        ...options
      });
    },
    warning: (message, options = {}) => {
      return toast.warning(message, {
        timeout: 3500,
        position: POSITION.TOP_RIGHT,
        ...options
      });
    }
  };
}

