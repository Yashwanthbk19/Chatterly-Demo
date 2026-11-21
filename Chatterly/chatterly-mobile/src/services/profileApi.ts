import { handleApiResponseStatus } from '../api/client';
import { API_BASE_URL } from '../config/api';
import type { ProfileDraft } from '../types/profile';
import type { AuthUser } from '../types/auth';

type CreateProfileResponse = { message?: string; user?: AuthUser };
type UpdateProfileResponse = { message?: string; user?: AuthUser };
export type ProfileUpdateDraft = Pick<
  AuthUser,
  'name' | 'email' | 'phone' | 'status' | 'dateOfBirth'
> & {
  image?: ProfileDraft['image'];
  removeProfilePic?: boolean;
};

const PROFILE_UPDATE_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * React Native's fetch implementation can fail before it sends a multipart
 * request containing a local Android file. XMLHttpRequest uses the native upload
 * path and, unlike apiRequest's development fallback, never tries to replay an
 * already-consumed FormData body.
 */
function sendProfileMultipart(
  token: string,
  body: FormData,
  action: 'create' | 'update',
): Promise<UpdateProfileResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(action === 'create' ? 'POST' : 'PATCH', `${API_BASE_URL}/auth/${action}-profile`);
    request.timeout = PROFILE_UPDATE_TIMEOUT_MS;
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Authorization', `Bearer ${token}`);

    request.onerror = () =>
      reject(
        new Error(
          `Profile ${action} could not reach Chatterly. Please check your connection and try again.`,
        ),
      );
    request.ontimeout = () =>
      reject(
        new Error(
          `Profile ${action} took too long. Your selected photo is kept; please try saving again.`,
        ),
      );
    request.onload = () => {
      let payload: UpdateProfileResponse & { error?: string } = {};
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        // The HTTP status below still gives the user a useful failure message.
      }

      if (request.status < 200 || request.status >= 300) {
        handleApiResponseStatus(request.status);
        reject(
          new Error(
            payload.message ||
              payload.error ||
              `Profile ${action} failed (${request.status}).`,
          ),
        );
        return;
      }
      resolve(payload);
    };

    try {
      // Do not set Content-Type: React Native must add the multipart boundary.
      request.send(body);
    } catch {
      reject(
        new Error('Unable to upload the profile changes. Please try again.'),
      );
    }
  });
}

export async function createProfile(
  token: string,
  draft: ProfileDraft,
  userId?: string,
): Promise<CreateProfileResponse> {
  const body = new FormData();
  body.append('name', draft.name.trim());
  body.append('dateOfBirth', draft.dateOfBirth);
  body.append('status', draft.bio.trim());
  // api.md documents userId as a multipart field. The live controller also
  // resolves the owner from the bearer token, so sending both keeps the client
  // compatible without weakening the authenticated ownership check.
  if (userId) { body.append('userId', userId); }

  if (draft.image) {
    body.append('profilePic', {
      uri: draft.image.uri,
      name: draft.image.fileName || 'profile.jpg',
      type: draft.image.mimeType || 'image/jpeg',
    } as unknown as Blob);
  }

  return sendProfileMultipart(token, body, 'create');
}

export async function updateProfile(
  token: string,
  draft: ProfileUpdateDraft,
): Promise<UpdateProfileResponse> {
  const body = new FormData();
  (['name', 'email', 'phone', 'status', 'dateOfBirth'] as const).forEach(
    key => {
      if (draft[key] !== undefined) {
        body.append(key, draft[key]!.trim());
      }
    },
  );
  if (draft.removeProfilePic) {
    body.append('removeProfilePic', 'true');
  }
  if (draft.image) {
    body.append('profilePic', {
      uri: draft.image.uri,
      name: draft.image.fileName || 'profile.jpg',
      type: draft.image.mimeType || 'image/jpeg',
    } as unknown as Blob);
  }
  return sendProfileMultipart(token, body, 'update');
}
