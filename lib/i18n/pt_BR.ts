import type { HttpError } from "..";

/**
 * Default error handler function that formats HttpError into a user-friendly message
 * @param error - The HTTP error to format
 * @returns A human-readable error message
 */
export function formatHttpError(error: HttpError): string {
  switch (error.type) {
    case 'network':
      return 'Não foi possível estabelecer uma conexão. Verifique sua internet.';
    case 'timeout':
      return 'A operação demorou mais do que o esperado. Tente novamente em alguns instantes.';
    case 'parse':
      return 'Ocorreu um problema ao processar a resposta.';
    case 'validation':
      return 'Os dados recebidos estão incorretos.';
    case 'response':
      // @ts-expect-error error
      if (error.data.message) return error.data.message;

      // @ts-expect-error error
      if (error.data.error.message) return error.data.error.message;

      switch (error.status) {
        case 400:
          return 'A solicitação contém dados incorretos. Verifique as informações enviadas.';
        case 401:
          return 'É necessário fazer login para acessar esta função.';
        case 403:
          return 'Acesso negado. Você não tem permissão para esta ação.';
        case 404:
          return 'O recurso que você procura não foi encontrado.';
        case 429:
          return 'Muitas solicitações em pouco tempo. Tente novamente mais tarde.';
        case 500:
          return 'Ocorreu um problema interno. Tente novamente mais tarde.';
        default:
          return `Houve um erro (${error.status}). Tente novamente mais tarde.`;
      }
  }
}

