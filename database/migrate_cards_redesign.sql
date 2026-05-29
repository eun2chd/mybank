-- 기존 DB 마이그레이션: cards 테이블 구조 변경
-- 권장: npm run db:migrate:cards  (idempotent, .env 사용)
-- 또는: mysql -u root -p mybank < database/migrate_cards_redesign.sql

USE mybank;

ALTER TABLE cards
  ADD COLUMN account_number VARCHAR(50) NULL COMMENT '체크카드 연결 계좌번호' AFTER card_type,
  ADD COLUMN card_number VARCHAR(50) NULL COMMENT '신용카드 번호' AFTER account_number,
  ADD COLUMN balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '카드 잔액' AFTER card_number;

-- FK 이름은 환경마다 다름. npm run db:migrate:cards 사용 권장
-- ALTER TABLE cards DROP FOREIGN KEY cards_ibfk_2;

ALTER TABLE cards
  DROP COLUMN account_id,
  DROP COLUMN billing_day,
  DROP COLUMN payment_day;
