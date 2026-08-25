-- Phase 10.3 · 19 §Erasure gains its verification step (Q30): the erasure request now
-- issues an emailed token, and only the token performs the anonymisation.
-- AlterEnum
ALTER TYPE "AuthTokenType" ADD VALUE 'ACCOUNT_ERASURE';
