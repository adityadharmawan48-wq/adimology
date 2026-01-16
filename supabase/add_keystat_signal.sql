-- Migration: Add keystat_signal column to agent_stories table
-- Description: Stores AI analysis of key statistics into easy-to-understand investment signals.

ALTER TABLE agent_stories 
ADD COLUMN IF NOT EXISTS keystat_signal TEXT;
