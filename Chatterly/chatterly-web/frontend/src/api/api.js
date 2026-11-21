import { requestEntity } from './client';

export const loginUser = async (data) =>
  requestEntity(
    {
      method: 'post',
      url: '/api/auth/login',
      data,
    },
    {
      fallbackMessage: 'Login failed.',
    }
  );
