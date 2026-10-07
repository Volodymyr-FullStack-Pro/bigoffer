
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "board_columns": {
                  Row: {
                    "id": string,"key": string,"kind": string,"position": number,"title": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "id"?: string,"key": string,"kind"?: string,"position": number,"title": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "id"?: string,"key"?: string,"kind"?: string,"position"?: number,"title"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_columns_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "created_at": string,"id": string,"logo_url": string | null,"name": string,"normalized_name": string,"website": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"logo_url"?: string | null,"name": string,"normalized_name": string,"website"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"logo_url"?: string | null,"name"?: string,"normalized_name"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"job_matches": {
                  Row: {
                    "breakdown": NonNullable<Json>,"created_at": string,"explanation": Json | null,"id": string,"job_id": string,"score": number,"search_profile_id": string | null,"state": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "breakdown"?: NonNullable<Json>,"created_at"?: string,"explanation"?: Json | null,"id"?: string,"job_id": string,"score": number,"search_profile_id"?: string | null,"state"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "breakdown"?: NonNullable<Json>,"created_at"?: string,"explanation"?: Json | null,"id"?: string,"job_id"?: string,"score"?: number,"search_profile_id"?: string | null,"state"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_matches_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_matches_search_profile_id_fkey"
      columns: ["search_profile_id"]
isOneToOne: false
      referencedRelation: "search_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_matches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"job_postings": {
                  Row: {
                    "external_id": string,"id": string,"job_id": string,"seen_at": string,"source_id": string,"url": string
                  }
                  Insert: {
                    "external_id": string,"id"?: string,"job_id": string,"seen_at"?: string,"source_id": string,"url": string
                  }
                  Update: {
                    "external_id"?: string,"id"?: string,"job_id"?: string,"seen_at"?: string,"source_id"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_postings_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_postings_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "company_id": string,"description_text": string,"enrich_error": string | null,"enriched_at": string | null,"fingerprint": string,"first_seen_at": string,"id": string,"lang": string | null,"last_seen_at": string,"location": string | null,"posted_at": string | null,"remote_type": string,"role_id": string | null,"salary_max_usd": number | null,"salary_min_usd": number | null,"salary_raw": string | null,"seniority": string | null,"skills": (string)[],"status": string,"summary": Json | null,"tags": (string)[],"title": string,"title_normalized": string | null
                  }
                  Insert: {
                    "company_id": string,"description_text"?: string,"enrich_error"?: string | null,"enriched_at"?: string | null,"fingerprint": string,"first_seen_at"?: string,"id"?: string,"lang"?: string | null,"last_seen_at"?: string,"location"?: string | null,"posted_at"?: string | null,"remote_type"?: string,"role_id"?: string | null,"salary_max_usd"?: number | null,"salary_min_usd"?: number | null,"salary_raw"?: string | null,"seniority"?: string | null,"skills"?: (string)[],"status"?: string,"summary"?: Json | null,"tags"?: (string)[],"title": string,"title_normalized"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"description_text"?: string,"enrich_error"?: string | null,"enriched_at"?: string | null,"fingerprint"?: string,"first_seen_at"?: string,"id"?: string,"lang"?: string | null,"last_seen_at"?: string,"location"?: string | null,"posted_at"?: string | null,"remote_type"?: string,"role_id"?: string | null,"salary_max_usd"?: number | null,"salary_min_usd"?: number | null,"salary_raw"?: string | null,"seniority"?: string | null,"skills"?: (string)[],"status"?: string,"summary"?: Json | null,"tags"?: (string)[],"title"?: string,"title_normalized"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "jobs_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"labels": {
                  Row: {
                    "color": string,"id": string,"key": string | null,"name": string | null,"user_id": string
                  }
                  Insert: {
                    "color": string,"id"?: string,"key"?: string | null,"name"?: string | null,"user_id": string
                  }
                  Update: {
                    "color"?: string,"id"?: string,"key"?: string | null,"name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "labels_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "contacts": NonNullable<Json>,"created_at": string,"digest_hour": number,"follow_up_days": (number)[],"full_name": string,"ghost_after_days": number,"id": string,"inbound_email_token": string,"locale": string,"onboarded_at": string | null,"plan": string,"telegram_chat_id": number | null,"timezone": string,"updated_at": string
                  }
                  Insert: {
                    "contacts"?: NonNullable<Json>,"created_at"?: string,"digest_hour"?: number,"follow_up_days"?: (number)[],"full_name"?: string,"ghost_after_days"?: number,"id": string,"inbound_email_token"?: string,"locale"?: string,"onboarded_at"?: string | null,"plan"?: string,"telegram_chat_id"?: number | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "contacts"?: NonNullable<Json>,"created_at"?: string,"digest_hour"?: number,"follow_up_days"?: (number)[],"full_name"?: string,"ghost_after_days"?: number,"id"?: string,"inbound_email_token"?: string,"locale"?: string,"onboarded_at"?: string | null,"plan"?: string,"telegram_chat_id"?: number | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "category": string,"id": string,"name": NonNullable<Json>,"slug": string
                  }
                  Insert: {
                    "category": string,"id"?: string,"name": NonNullable<Json>,"slug": string
                  }
                  Update: {
                    "category"?: string,"id"?: string,"name"?: NonNullable<Json>,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"search_profile_queries": {
                  Row: {
                    "search_profile_id": string,"search_query_id": string
                  }
                  Insert: {
                    "search_profile_id": string,"search_query_id": string
                  }
                  Update: {
                    "search_profile_id"?: string,"search_query_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_profile_queries_search_profile_id_fkey"
      columns: ["search_profile_id"]
isOneToOne: false
      referencedRelation: "search_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_profile_queries_search_query_id_fkey"
      columns: ["search_query_id"]
isOneToOne: false
      referencedRelation: "search_queries"
      referencedColumns: ["id"]
    }
                  ]
                },"search_profiles": {
                  Row: {
                    "created_at": string,"exclude_keywords": (string)[],"id": string,"is_active": boolean,"keywords": (string)[],"locations": (string)[],"name": string,"remote_type": string,"role_id": string | null,"salary_min_usd": number | null,"seniority": (string)[],"skills": (string)[],"sources": (string)[] | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"exclude_keywords"?: (string)[],"id"?: string,"is_active"?: boolean,"keywords"?: (string)[],"locations"?: (string)[],"name": string,"remote_type"?: string,"role_id"?: string | null,"salary_min_usd"?: number | null,"seniority"?: (string)[],"skills"?: (string)[],"sources"?: (string)[] | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"exclude_keywords"?: (string)[],"id"?: string,"is_active"?: boolean,"keywords"?: (string)[],"locations"?: (string)[],"name"?: string,"remote_type"?: string,"role_id"?: string | null,"salary_min_usd"?: number | null,"seniority"?: (string)[],"skills"?: (string)[],"sources"?: (string)[] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "search_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"search_queries": {
                  Row: {
                    "id": string,"last_run_at": string | null,"next_run_at": string,"params": NonNullable<Json>,"query_key": string,"source_id": string
                  }
                  Insert: {
                    "id"?: string,"last_run_at"?: string | null,"next_run_at"?: string,"params"?: NonNullable<Json>,"query_key": string,"source_id": string
                  }
                  Update: {
                    "id"?: string,"last_run_at"?: string | null,"next_run_at"?: string,"params"?: NonNullable<Json>,"query_key"?: string,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "search_queries_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"skills": {
                  Row: {
                    "aliases": (string)[],"id": string,"name": NonNullable<Json>,"slug": string
                  }
                  Insert: {
                    "aliases"?: (string)[],"id"?: string,"name": NonNullable<Json>,"slug": string
                  }
                  Update: {
                    "aliases"?: (string)[],"id"?: string,"name"?: NonNullable<Json>,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"source_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"found": number,"id": string,"inserted": number,"query_id": string | null,"source_id": string,"started_at": string,"status": string
                  }
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"found"?: number,"id"?: string,"inserted"?: number,"query_id"?: string | null,"source_id": string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"found"?: number,"id"?: string,"inserted"?: number,"query_id"?: string | null,"source_id"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_runs_query_id_fkey"
      columns: ["query_id"]
isOneToOne: false
      referencedRelation: "search_queries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "consecutive_empty_runs": number,"enabled": boolean,"id": string,"kind": string,"min_interval_minutes": number,"name": string,"paused_until": string | null
                  }
                  Insert: {
                    "consecutive_empty_runs"?: number,"enabled"?: boolean,"id": string,"kind": string,"min_interval_minutes"?: number,"name": string,"paused_until"?: string | null
                  }
                  Update: {
                    "consecutive_empty_runs"?: number,"enabled"?: boolean,"id"?: string,"kind"?: string,"min_interval_minutes"?: number,"name"?: string,"paused_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "find_similar_job":
{ Args: { "p_company_id": string,"p_title": string }; Returns: string
                           },
"text_array_max_len":
{ Args: { "arr": (string)[] }; Returns: number
                           },
"upsert_job_matches":
{ Args: { "rows": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
