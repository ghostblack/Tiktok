
export interface ScenePrompt {
  scene_title: string;
  angle_description: string;
  image_prompt: string;
  kling_video_prompt: string;
  cta_text: string; // New field for persuasive text/script
}

export interface GeneratedCampaign {
  product_name: string;
  social_media_caption: string; // New field for viral hashtags/caption
  voiceover_script: string; // New field for audio narration
  scenes: ScenePrompt[];
}

export enum ProcessStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type ModelType = 'indo_man' | 'indo_woman' | 'indo_hijab' | 'no_model';
export type StyleType = 'cinematic' | 'natural' | 'unboxing' | 'outdoor';

export interface CampaignConfig {
  modelType: ModelType;
  styleType: StyleType;
  productName: string;
  productPrice: string; // New input for price
}
