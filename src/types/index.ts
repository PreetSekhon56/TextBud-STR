export interface Owner {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  created_at: string;
}

export interface Property {
  id: number;
  owner_id: number;
  name: string;
  address: string | null;
  deep_clean_cycle: number; // every Nth clean triggers deep clean
  clean_count: number; // current count towards next deep clean
  setup_complete: boolean;
  setup_step: string | null; // tracks where owner is in setup wizard: 'rooms' | 'photos' | 'faq' | 'checklists' | 'deep_clean' | 'review' | null
  created_at: string;
}

export interface Room {
  id: number;
  property_id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface StagingPhoto {
  id: number;
  room_id: number;
  file_id: string; // Telegram file_id for retrieval
  file_path: string; // local storage path
  sort_order: number;
  created_at: string;
}

export interface FaqEntry {
  id: number;
  property_id: number;
  category: string; // 'wifi' | 'parking' | 'trash' | 'appliances' | 'house_rules' | 'emergency' | 'custom'
  question: string;
  answer: string;
  created_at: string;
}

export interface Checklist {
  id: number;
  room_id: number;
  clean_type: 'standard' | 'deep';
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  checklist_id: number;
  description: string;
  sort_order: number;
  created_at: string;
}

export interface Cleaner {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  created_at: string;
}

export interface TelegramGroup {
  id: number;
  chat_id: number;
  property_id: number;
  owner_id: number;
  cleaner_id: number | null;
  group_type: 'cleaning' | 'guest';
  is_active: boolean;
  created_at: string;
}

export interface SetupSession {
  id: number;
  owner_id: number;
  property_id: number;
  current_step: string; // 'rooms' | 'photos' | 'faq' | 'checklists' | 'deep_clean' | 'review'
  current_room_index: number | null; // which room we're collecting photos/checklists for
  created_at: string;
  updated_at: string;
}
