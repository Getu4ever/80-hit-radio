export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "user" | "admin";

/** Stripe-aligned subscription status stored on the profile. */
export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "canceled"
  | "past_due"
  | "none";

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  stripe_customer_id: string | null;
  stripe_subscription_status: StripeSubscriptionStatus;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          stripe_customer_id: string | null;
          stripe_subscription_status: StripeSubscriptionStatus;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          stripe_customer_id?: string | null;
          stripe_subscription_status?: StripeSubscriptionStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          stripe_customer_id?: string | null;
          stripe_subscription_status?: StripeSubscriptionStatus;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      artists: {
        Row: {
          id: string;
          name: string;
          normalized_name: string;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          normalized_name: string;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          normalized_name?: string;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tracks: {
        Row: {
          id: string;
          title: string;
          artist: string;
          artist_id: string | null;
          year: number;
          youtube_id: string;
          subgenre: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          artist: string;
          artist_id?: string | null;
          year: number;
          youtube_id: string;
          subgenre: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          artist?: string;
          artist_id?: string | null;
          year?: number;
          youtube_id?: string;
          subgenre?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracks_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };
      listen_events: {
        Row: {
          id: string;
          user_id: string | null;
          track_id: string | null;
          event_type: "play_start" | "play_complete" | "skip" | "session_start";
          duration_seconds: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          track_id?: string | null;
          event_type: "play_start" | "play_complete" | "skip" | "session_start";
          duration_seconds?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          track_id?: string | null;
          event_type?: "play_start" | "play_complete" | "skip" | "session_start";
          duration_seconds?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listen_events_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      listener_presence: {
        Row: {
          session_id: string;
          user_id: string | null;
          last_seen_at: string;
        };
        Insert: {
          session_id: string;
          user_id?: string | null;
          last_seen_at?: string;
        };
        Update: {
          session_id?: string;
          user_id?: string | null;
          last_seen_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
