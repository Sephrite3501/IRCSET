export interface AxiosErrorResponse {
  response?: {
    data?: {
      error?: string;
    };
  };
  message?: string;
}


export function getFriendlyError(
  error: AxiosErrorResponse,
  fallbackMsg: string,
  refId: string
): string {
  const serverMsg = error?.response?.data?.error;

  if (
    serverMsg &&
    typeof serverMsg === 'string' &&
    !serverMsg.toLowerCase().includes('internal')
  ) {
    return `${serverMsg} (Ref: ${refId})`;
  }

  if (error?.message === 'Network Error') {
    return `Cannot reach the server. Please try again. (Ref: ${refId})`;
  }

  return `${fallbackMsg} (Ref: ${refId})`;
}
