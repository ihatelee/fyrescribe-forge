export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chapters: {
        Row: {
          created_at: string
          id: string
          order: number
          project_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          order?: number
          project_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          order?: number
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          category: Database["public"]["Enums"]["entity_category"]
          cover_image_url: string | null
          created_at: string
          fields: Json | null
          gallery_image_urls: string[] | null
          id: string
          is_dirty: boolean | null
          name: string
          project_id: string
          sections: Json | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["entity_category"]
          cover_image_url?: string | null
          created_at?: string
          fields?: Json | null
          gallery_image_urls?: string[] | null
          id?: string
          is_dirty?: boolean | null
          name: string
          project_id: string
          sections?: Json | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["entity_category"]
          cover_image_url?: string | null
          created_at?: string
          fields?: Json | null
          gallery_image_urls?: string[] | null
          id?: string
          is_dirty?: boolean | null
          name?: string
          project_id?: string
          sections?: Json | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_links: {
        Row: {
          entity_a_id: string
          entity_b_id: string
          id: string
          relationship: string | null
        }
        Insert: {
          entity_a_id: string
          entity_b_id: string
          id?: string
          relationship?: string | null
        }
        Update: {
          entity_a_id?: string
          entity_b_id?: string
          id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_links_entity_a_id_fkey"
            columns: ["entity_a_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_links_entity_b_id_fkey"
            columns: ["entity_b_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_tags: {
        Row: {
          entity_id: string
          tag_id: string
        }
        Insert: {
          entity_id: string
          tag_id: string
        }
        Update: {
          entity_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_tags_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lore_suggestions: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          payload: Json | null
          project_id: string
          reviewed_at: string | null
          status: Database["public"]["Enums"]["lore_suggestion_status"]
          type: Database["public"]["Enums"]["lore_suggestion_type"]
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
          project_id: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["lore_suggestion_status"]
          type: Database["public"]["Enums"]["lore_suggestion_type"]
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
          project_id?: string
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["lore_suggestion_status"]
          type?: Database["public"]["Enums"]["lore_suggestion_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lore_suggestions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lore_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          last_sync_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_sync_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_sync_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      scene_tags: {
        Row: {
          scene_id: string
          tag_id: string
        }
        Insert: {
          scene_id: string
          tag_id: string
        }
        Update: {
          scene_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_tags_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          chapter_id: string
          content: string | null
          id: string
          is_dirty: boolean | null
          order: number
          pov_character_id: string | null
          project_id: string
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          chapter_id: string
          content?: string | null
          id?: string
          is_dirty?: boolean | null
          order?: number
          pov_character_id?: string | null
          project_id: string
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          chapter_id?: string
          content?: string | null
          id?: string
          is_dirty?: boolean | null
          order?: number
          pov_character_id?: string | null
          project_id?: string
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_pov_character_id_fkey"
            columns: ["pov_character_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          id: string
          project_id: string
          ran_at: string
          scenes_processed: number | null
          status: Database["public"]["Enums"]["sync_status"]
          suggestions_created: number | null
          triggered_by: Database["public"]["Enums"]["sync_trigger"]
        }
        Insert: {
          id?: string
          project_id: string
          ran_at?: string
          scenes_processed?: number | null
          status?: Database["public"]["Enums"]["sync_status"]
          suggestions_created?: number | null
          triggered_by: Database["public"]["Enums"]["sync_trigger"]
        }
        Update: {
          id?: string
          project_id?: string
          ran_at?: string
          scenes_processed?: number | null
          status?: Database["public"]["Enums"]["sync_status"]
          suggestions_created?: number | null
          triggered_by?: Database["public"]["Enums"]["sync_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
          project_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
          project_id: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          date_label: string | null
          date_sort: number | null
          entity_id: string | null
          id: string
          label: string
          project_id: string
          type: Database["public"]["Enums"]["timeline_event_type"]
        }
        Insert: {
          date_label?: string | null
          date_sort?: number | null
          entity_id?: string | null
          id?: string
          label: string
          project_id: string
          type?: Database["public"]["Enums"]["timeline_event_type"]
        }
        Update: {
          date_label?: string | null
          date_sort?: number | null
          entity_id?: string | null
          id?: string
          label?: string
          project_id?: string
          type?: Database["public"]["Enums"]["timeline_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      entity_category:
        | "characters"
        | "places"
        | "events"
        | "artifacts"
        | "creatures"
        | "abilities"
        | "factions"
        | "doctrine"
      lore_suggestion_status: "pending" | "accepted" | "edited" | "rejected"
      lore_suggestion_type:
        | "new_entity"
        | "field_update"
        | "contradiction"
        | "new_tag"
      sync_status: "running" | "completed" | "failed"
      sync_trigger: "scheduled" | "manual"
      timeline_event_type: "world_history" | "story_event"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      entity_category: [
        "characters",
        "places",
        "events",
        "artifacts",
        "creatures",
        "abilities",
        "factions",
        "doctrine",
      ],
      lore_suggestion_status: ["pending", "accepted", "edited", "rejected"],
      lore_suggestion_type: [
        "new_entity",
        "field_update",
        "contradiction",
        "new_tag",
      ],
      sync_status: ["running", "completed", "failed"],
      sync_trigger: ["scheduled", "manual"],
      timeline_event_type: ["world_history", "story_event"],
    },
  },
} as const
