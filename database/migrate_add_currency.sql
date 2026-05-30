-- investments 테이블에 통화 및 원화 환산 전 가격 컬럼 추가
ALTER TABLE investments
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'KRW' AFTER current_price,
  ADD COLUMN IF NOT EXISTS original_price DECIMAL(20,6) DEFAULT NULL AFTER currency;
