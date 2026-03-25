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

export interface CleaningSession {
  id: number;
  property_id: number;
  cleaner_id: number;
  chat_id: number;
  clean_type: 'standard' | 'deep';
  current_room_id: number | null;
  entry_video_file_id: string | null;
  checked_in_at: string;
  completed_at: string | null;
  summary: string | null;
  created_at: string;
}

export interface MilestonePhoto {
  id: number;
  session_id: number;
  room_id: number;
  file_id: string;
  attempt_number: number;
  created_at: string;
}

export interface ComparisonResult {
  id: number;
  milestone_photo_id: number;
  staging_photo_id: number;
  passed: boolean;
  issues: string | null;
  raw_response: string | null;
  created_at: string;
}

export interface SessionChecklistProgress {
  id: number;
  session_id: number;
  checklist_item_id: number;
  completed_at: string;
}

export interface CompletionReport {
  id: number;
  session_id: number;
  property_id: number;
  report_data: string; // JSON blob
  created_at: string;
}

export interface InventoryItem {
  id: number;
  property_id: number;
  name: string;
  par_level: number | null;
  last_count: number | null;
  last_counted_at: string | null;
  sort_order: number;
  is_active: number; // 0 or 1
  created_at: string;
}

export interface InventoryCount {
  id: number;
  inventory_item_id: number;
  session_id: number | null;
  count: number;
  previous_count: number | null;
  consumption_delta: number | null;
  counted_by: string; // 'cleaner' | 'owner'
  notes: string | null;
  created_at: string;
}

export interface InventoryPhoto {
  id: number;
  inventory_count_id: number;
  file_id: string;
  ai_analysis: string | null;
  created_at: string;
}

export interface GuestInteraction {
  id: number;
  property_id: number;
  chat_id: number;
  guest_telegram_id: number;
  question: string;
  answer: string | null;
  matched_faq_id: number | null;
  was_answered: number; // 0 or 1
  owner_notified: number; // 0 or 1
  created_at: string;
}

export interface ActiveInventorySession {
  sessionId: number;
  propertyId: number;
  chatId: number;
  cleanerId: number;
  items: InventoryItem[];
  currentItemIndex: number;
  counts: Map<number, number>;
  photos: Map<number, string>;
  waitingForInventoryPhoto: boolean;
  lastActivity: number;
}

export interface Subscription {
  id: number;
  owner_id: number;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: 'pending' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing';
  quantity: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number; // 0 or 1
  created_at: string;
  updated_at: string;
}
