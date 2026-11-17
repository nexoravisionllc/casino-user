-- STEP 3 of 4: add the initial accounts
-- Password for all three:  @12345#$%
-- Safe to re-run: an account is skipped if its LoginId already exists.

USE Solution;

-- Super administrator (Role 1, no parent)
INSERT INTO Partners (Name, LoginId, Password, PartnerId, Email, Balance, Point, Role,
                      CasinoRate, SlotRate, SportsRate, Status, CreatedAt, UpdatedAt)
SELECT 'Admin', 'Admin', '100000.OqrUZ1GEji4dZ9R90MwcQA==.+falGfbj/l+b5gqYZ9YcFv2nkaScOAMp2u/s4/yuvE8=',
       NULL, 'admin@example.com', 0, 0, 1, 0, 0, 0, 'Active', NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM Partners WHERE LoginId = 'Admin');

-- Agent under the administrator (Role 2)
INSERT INTO Partners (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                      Balance, Point, Role, CasinoRate, SlotRate, SportsRate, Status, CreatedAt, UpdatedAt)
SELECT 'agent', 'agent', '100000.LFrK55Rl81leAzq7O1uqRg==.MH6qFUcq8IGRMdOrZJYXtAcvR7UM7bI/J/PjVZxcO4o=',
       (SELECT Uid FROM (SELECT Uid FROM Partners WHERE LoginId = 'Admin') a),
       'agent@example.com', 'JPMorgan Chase', '482915736', 'agent',
       0, 0, 2, 5.0, 4.0, 3.0, 'Active', NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM Partners WHERE LoginId = 'agent');

-- Player under the agent: balance 1000, points 250
INSERT INTO Users (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                   Status, Balance, Point, CreatedAt, UpdatedAt)
SELECT 'user', 'user', '100000.HuddyMs62HasNmzmzis94A==.iGevGrI+hl01vEi9PvlazZYdEzveeJ8+NpOgizmvfDc=',
       (SELECT Uid FROM Partners WHERE LoginId = 'agent'),
       'user@example.com', 'Wells Fargo', '615204983', 'user',
       'Active', 1000.00, 250.00, NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM Users WHERE LoginId = 'user');
