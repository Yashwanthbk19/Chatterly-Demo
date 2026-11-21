export type ProfileDraft = {
  name: string;
  dateOfBirth: string;
  bio: string;
  image?: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
  };
};
