-- STEP 4 of 4: check the result (read-only)

USE Solution;

-- Expect 8 tables
SHOW TABLES;

-- Expect: Admin (role 1), agent (role 2, parent Admin), user (parent agent)
SELECT 'Partner' AS kind, Uid, LoginId, Role, PartnerId, Balance, Point FROM Partners
UNION ALL
SELECT 'User',            Uid, LoginId, NULL, PartnerId, Balance, Point FROM Users;
