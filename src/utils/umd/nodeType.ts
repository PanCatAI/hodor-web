export type DataTypeMap = {
  INT: number;
  FLOAT: number;
  STRING: string;
  BOOLEAN: boolean;
  IMAGE: ImageData;
  AUDIO: AudioData;
  VIDEO: VideoData;
  ANY: unknown;
};

export type DataType = keyof DataTypeMap;

export interface ImageData {
  url: string;
  name?: string;
  width?: number;
  height?: number;
  format?: "png" | "jpg" | "webp" | "gif";
}

export interface AudioData {
  url: string;
  name?: string;
  duration?: number;
  sampleRate?: number;
  format?: "mp3" | "wav" | "flac" | "ogg";
}

export interface VideoData {
  url: string;
  name?: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  format?: "mp4" | "webm";
}

export interface ConditioningData {
  text: string;
  strength?: number;
}
