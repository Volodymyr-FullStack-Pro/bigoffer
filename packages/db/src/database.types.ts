
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
            "ai_usage": {
                  Row: {
                    "day": string,"input_tokens": number,"model": string,"output_tokens": number,"requests": number,"sensitivity": string
                  }
                  Insert: {
                    "day": string,"input_tokens"?: number,"model": string,"output_tokens"?: number,"requests"?: number,"sensitivity": string
                  }
                  Update: {
                    "day"?: string,"input_tokens"?: number,"model"?: string,"output_tokens"?: number,"requests"?: number,"sensitivity"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_user_usage": {
                  Row: {
                    "day": string,"requests": number,"user_id": string
                  }
                  Insert: {
                    "day": string,"requests"?: number,"user_id": string
                  }
                  Update: {
                    "day"?: string,"requests"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"answer_bank": {
                  Row: {
                    "answer": NonNullable<Json>,"id": string,"key": string,"question": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "answer"?: NonNullable<Json>,"id"?: string,"key": string,"question": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "answer"?: NonNullable<Json>,"id"?: string,"key"?: string,"question"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "answer_bank_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"application_events": {
                  Row: {
                    "application_id": string,"created_at": string,"id": string,"payload": NonNullable<Json>,"type": string,"user_id": string
                  }
                  Insert: {
                    "application_id": string,"created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"type": string,"user_id": string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"id"?: string,"payload"?: NonNullable<Json>,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_events_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"application_labels": {
                  Row: {
                    "application_id": string,"label_id": string
                  }
                  Insert: {
                    "application_id": string,"label_id": string
                  }
                  Update: {
                    "application_id"?: string,"label_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_labels_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_labels_label_id_fkey"
      columns: ["label_id"]
isOneToOne: false
      referencedRelation: "labels"
      referencedColumns: ["id"]
    }
                  ]
                },"application_messages": {
                  Row: {
                    "ai_classification": string | null,"ai_extracted": Json | null,"application_id": string,"author": string | null,"body": string,"channel": string,"direction": string,"id": string,"sent_at": string,"user_id": string
                  }
                  Insert: {
                    "ai_classification"?: string | null,"ai_extracted"?: Json | null,"application_id": string,"author"?: string | null,"body": string,"channel": string,"direction": string,"id"?: string,"sent_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_classification"?: string | null,"ai_extracted"?: Json | null,"application_id"?: string,"author"?: string | null,"body"?: string,"channel"?: string,"direction"?: string,"id"?: string,"sent_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "application_messages_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "application_messages_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"applications": {
                  Row: {
                    "applied_at": string | null,"column_id": string,"company": string,"contact": NonNullable<Json>,"created_at": string,"first_response_at": string | null,"follow_up_count": number,"id": string,"job_id": string | null,"last_activity_at": string | null,"letter_kind": string | null,"letter_used": string | null,"location": string | null,"next_action_at": string | null,"notes": string | null,"outcome": string,"rank": string,"rejection_by": string | null,"rejection_note": string | null,"rejection_reasons": (string)[],"rejection_stage": string | null,"salary": string | null,"source_id": string | null,"title": string,"updated_at": string,"url": string | null,"user_id": string
                  }
                  Insert: {
                    "applied_at"?: string | null,"column_id": string,"company"?: string,"contact"?: NonNullable<Json>,"created_at"?: string,"first_response_at"?: string | null,"follow_up_count"?: number,"id"?: string,"job_id"?: string | null,"last_activity_at"?: string | null,"letter_kind"?: string | null,"letter_used"?: string | null,"location"?: string | null,"next_action_at"?: string | null,"notes"?: string | null,"outcome"?: string,"rank": string,"rejection_by"?: string | null,"rejection_note"?: string | null,"rejection_reasons"?: (string)[],"rejection_stage"?: string | null,"salary"?: string | null,"source_id"?: string | null,"title": string,"updated_at"?: string,"url"?: string | null,"user_id": string
                  }
                  Update: {
                    "applied_at"?: string | null,"column_id"?: string,"company"?: string,"contact"?: NonNullable<Json>,"created_at"?: string,"first_response_at"?: string | null,"follow_up_count"?: number,"id"?: string,"job_id"?: string | null,"last_activity_at"?: string | null,"letter_kind"?: string | null,"letter_used"?: string | null,"location"?: string | null,"next_action_at"?: string | null,"notes"?: string | null,"outcome"?: string,"rank"?: string,"rejection_by"?: string | null,"rejection_note"?: string | null,"rejection_reasons"?: (string)[],"rejection_stage"?: string | null,"salary"?: string | null,"source_id"?: string | null,"title"?: string,"updated_at"?: string,"url"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_column_id_fkey"
      columns: ["column_id"]
isOneToOne: false
      referencedRelation: "board_columns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"apply_kits": {
                  Row: {
                    "cover_letter": string,"form_answers": NonNullable<Json>,"generated_at": string,"id": string,"job_id": string,"lang": string,"red_flags": (string)[],"requirements": NonNullable<Json>,"salary_hint": string | null,"short_message": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "cover_letter": string,"form_answers"?: NonNullable<Json>,"generated_at"?: string,"id"?: string,"job_id": string,"lang": string,"red_flags"?: (string)[],"requirements"?: NonNullable<Json>,"salary_hint"?: string | null,"short_message": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cover_letter"?: string,"form_answers"?: NonNullable<Json>,"generated_at"?: string,"id"?: string,"job_id"?: string,"lang"?: string,"red_flags"?: (string)[],"requirements"?: NonNullable<Json>,"salary_hint"?: string | null,"short_message"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "apply_kits_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "apply_kits_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"board_columns": {
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
                    "breakdown": NonNullable<Json>,"created_at": string,"explained_at": string | null,"explanation": Json | null,"id": string,"job_id": string,"notified_at": string | null,"score": number,"search_profile_id": string | null,"state": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "breakdown"?: NonNullable<Json>,"created_at"?: string,"explained_at"?: string | null,"explanation"?: Json | null,"id"?: string,"job_id": string,"notified_at"?: string | null,"score": number,"search_profile_id"?: string | null,"state"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "breakdown"?: NonNullable<Json>,"created_at"?: string,"explained_at"?: string | null,"explanation"?: Json | null,"id"?: string,"job_id"?: string,"notified_at"?: string | null,"score"?: number,"search_profile_id"?: string | null,"state"?: string,"updated_at"?: string,"user_id"?: string
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
                    "company_id": string,"company_is_placeholder": boolean,"description_text": string,"enrich_attempts": number,"enrich_error": string | null,"enriched_at": string | null,"fingerprint": string,"first_seen_at": string,"id": string,"is_job": boolean | null,"lang": string | null,"last_seen_at": string,"live_checked_at": string | null,"location": string | null,"posted_at": string | null,"remote_regions": (string)[],"remote_type": string,"role": string | null,"role_id": string | null,"salary_max_usd": number | null,"salary_min_usd": number | null,"salary_raw": string | null,"seniority": string | null,"skills": (string)[],"status": string,"summary": Json | null,"tags": (string)[],"title": string,"title_normalized": string | null
                  }
                  Insert: {
                    "company_id": string,"company_is_placeholder"?: boolean,"description_text"?: string,"enrich_attempts"?: number,"enrich_error"?: string | null,"enriched_at"?: string | null,"fingerprint": string,"first_seen_at"?: string,"id"?: string,"is_job"?: boolean | null,"lang"?: string | null,"last_seen_at"?: string,"live_checked_at"?: string | null,"location"?: string | null,"posted_at"?: string | null,"remote_regions"?: (string)[],"remote_type"?: string,"role"?: string | null,"role_id"?: string | null,"salary_max_usd"?: number | null,"salary_min_usd"?: number | null,"salary_raw"?: string | null,"seniority"?: string | null,"skills"?: (string)[],"status"?: string,"summary"?: Json | null,"tags"?: (string)[],"title": string,"title_normalized"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"company_is_placeholder"?: boolean,"description_text"?: string,"enrich_attempts"?: number,"enrich_error"?: string | null,"enriched_at"?: string | null,"fingerprint"?: string,"first_seen_at"?: string,"id"?: string,"is_job"?: boolean | null,"lang"?: string | null,"last_seen_at"?: string,"live_checked_at"?: string | null,"location"?: string | null,"posted_at"?: string | null,"remote_regions"?: (string)[],"remote_type"?: string,"role"?: string | null,"role_id"?: string | null,"salary_max_usd"?: number | null,"salary_min_usd"?: number | null,"salary_raw"?: string | null,"seniority"?: string | null,"skills"?: (string)[],"status"?: string,"summary"?: Json | null,"tags"?: (string)[],"title"?: string,"title_normalized"?: string | null
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
                },"letter_templates": {
                  Row: {
                    "body": string,"id": string,"locale": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"id"?: string,"locale": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"locale"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "letter_templates_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "contacts": NonNullable<Json>,"country": string | null,"created_at": string,"digest_hour": number,"digest_last_sent_on": string | null,"follow_up_days": (number)[],"full_name": string,"ghost_after_days": number,"id": string,"inbound_email_token": string,"locale": string,"onboarded_at": string | null,"plan": string,"search_requested_at": string | null,"telegram_alerts": boolean,"telegram_chat_id": number | null,"telegram_min_score": number,"timezone": string,"ui_prefs": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "contacts"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"digest_hour"?: number,"digest_last_sent_on"?: string | null,"follow_up_days"?: (number)[],"full_name"?: string,"ghost_after_days"?: number,"id": string,"inbound_email_token"?: string,"locale"?: string,"onboarded_at"?: string | null,"plan"?: string,"search_requested_at"?: string | null,"telegram_alerts"?: boolean,"telegram_chat_id"?: number | null,"telegram_min_score"?: number,"timezone"?: string,"ui_prefs"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "contacts"?: NonNullable<Json>,"country"?: string | null,"created_at"?: string,"digest_hour"?: number,"digest_last_sent_on"?: string | null,"follow_up_days"?: (number)[],"full_name"?: string,"ghost_after_days"?: number,"id"?: string,"inbound_email_token"?: string,"locale"?: string,"onboarded_at"?: string | null,"plan"?: string,"search_requested_at"?: string | null,"telegram_alerts"?: boolean,"telegram_chat_id"?: number | null,"telegram_min_score"?: number,"timezone"?: string,"ui_prefs"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recruiter_lookups": {
                  Row: {
                    "company_key": string,"fetched_at": string,"people": NonNullable<Json>
                  }
                  Insert: {
                    "company_key": string,"fetched_at"?: string,"people"?: NonNullable<Json>
                  }
                  Update: {
                    "company_key"?: string,"fetched_at"?: string,"people"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"resumes": {
                  Row: {
                    "created_at": string,"file_name": string,"id": string,"is_primary": boolean,"parse_error": string | null,"parse_error_detail": string | null,"parsed": Json | null,"storage_path": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"file_name": string,"id"?: string,"is_primary"?: boolean,"parse_error"?: string | null,"parse_error_detail"?: string | null,"parsed"?: Json | null,"storage_path": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"file_name"?: string,"id"?: string,"is_primary"?: boolean,"parse_error"?: string | null,"parse_error_detail"?: string | null,"parsed"?: Json | null,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resumes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                    "created_at": string,"exclude_keywords": (string)[],"id": string,"is_active": boolean,"keywords": (string)[],"locations": (string)[],"name": string,"remote_type": string,"role_id": string | null,"salary_min_usd": number | null,"seniority": (string)[],"skills": (string)[],"sources": (string)[] | null,"target_roles": (string)[],"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"exclude_keywords"?: (string)[],"id"?: string,"is_active"?: boolean,"keywords"?: (string)[],"locations"?: (string)[],"name": string,"remote_type"?: string,"role_id"?: string | null,"salary_min_usd"?: number | null,"seniority"?: (string)[],"skills"?: (string)[],"sources"?: (string)[] | null,"target_roles"?: (string)[],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"exclude_keywords"?: (string)[],"id"?: string,"is_active"?: boolean,"keywords"?: (string)[],"locations"?: (string)[],"name"?: string,"remote_type"?: string,"role_id"?: string | null,"salary_min_usd"?: number | null,"seniority"?: (string)[],"skills"?: (string)[],"sources"?: (string)[] | null,"target_roles"?: (string)[],"updated_at"?: string,"user_id"?: string
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
                },"source_boards": {
                  Row: {
                    "created_at": string,"enabled": boolean,"failures": number,"last_ok_at": string | null,"name": string | null,"origin": string,"slug": string,"source_id": string
                  }
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"failures"?: number,"last_ok_at"?: string | null,"name"?: string | null,"origin"?: string,"slug": string,"source_id": string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"failures"?: number,"last_ok_at"?: string | null,"name"?: string | null,"origin"?: string,"slug"?: string,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_boards_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
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
                },"telegram_link_tokens": {
                  Row: {
                    "created_at": string,"expires_at": string,"token_hash": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "bot_save_match":
{ Args: { "p_column_key": string,"p_match_id": string,"p_rank": string,"p_user_id": string }; Returns: string
                           },
"consume_private_ai":
{ Args: { "p_limit": number }; Returns: boolean
                           },
"create_telegram_link_token":
{ Args: { "p_token_hash": string }; Returns: undefined
                           },
"find_similar_job":
{ Args: { "p_company_id": string,"p_title": string }; Returns: string
                           },
"hide_match":
{ Args: { "p_match_id": string }; Returns: string
                           },
"jobs_to_enrich":
{ Args: { "p_job_ids"?: (string)[],"p_limit": number }; Returns: string[]
                           },
"link_telegram":
{ Args: { "p_chat_id": number,"p_token_hash": string }; Returns: string
                           },
"matches_to_explain":
{ Args: { "p_day_start": string,"p_min_score": number,"p_per_user": number,"p_user_ids"?: (string)[] }; Returns: {
              "locale": string,"match_id": string,"user_id": string
            }[]
                           },
"move_application":
{ Args: { "p_column_id": string,"p_id": string,"p_rank": string }; Returns: undefined
                           },
"ping_application":
{ Args: { "p_id": string }; Returns: undefined
                           },
"purge_expired_jobs":
{ Args: { "p_cutoff": string,"p_limit"?: number }; Returns: number
                           },
"record_ai_usage":
{ Args: { "p_day": string,"p_input": number,"p_model": string,"p_output": number,"p_requests": number,"p_sensitivity": string }; Returns: undefined
                           },
"reject_application":
{ Args: { "p_by": string,"p_column_id": string,"p_id": string,"p_note": string,"p_outcome"?: string,"p_rank": string,"p_reasons": (string)[],"p_stage": string }; Returns: undefined
                           },
"request_search_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"restore_match":
{ Args: { "p_application_id"?: string,"p_match_id": string }; Returns: undefined
                           },
"save_match_to_board":
{ Args: { "p_column_key": string,"p_match_id": string,"p_rank": string }; Returns: {
              "application_id": string,"created": boolean
            }[]
                           },
"search_now_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "done": number,"new_matches": number,"requested_at": string,"total": number
            }[]
                           },
"text_array_max_len":
{ Args: { "arr": (string)[] }; Returns: number
                           },
"unlink_telegram":
{ Args: Record<PropertyKey, never>; Returns: undefined
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
