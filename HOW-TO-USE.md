# How to use Nexora Vision Play (player guide)

This guide explains how players use the casino website: creating an account, playing games, and managing money.

For installation, see `Setup.md`. For the operator side (approving players and requests), see `HOW-TO-USE.md` in the `casino-admin` repo.

## Contents

1. [Create an account](#1-create-an-account)
2. [Sign in and sign out](#2-sign-in-and-sign-out)
3. [Finding your way around](#3-finding-your-way-around)
4. [Balance and points](#4-balance-and-points)
5. [Playing games](#5-playing-games)
6. [Deposit](#6-deposit)
7. [Withdraw](#7-withdraw)
8. [Convert points to balance](#8-convert-points-to-balance)
9. [Transaction history](#9-transaction-history)
10. [Settings: theme and mobile](#10-settings-theme-and-mobile)
11. [Common questions](#11-common-questions)

---

## 1. Create an account

1. Open the site and click **Sign Up**, either in the top-right corner or on the banner at the top of the home page.
2. Fill in the form:

   | Field | Required | Notes |
   |---|---|---|
   | Name | Yes | Your name. |
   | Login ID | Yes | What you type to sign in. It must be unique. If it's taken, you'll see *The login ID "…" is already taken.* |
   | Password / Confirm password | Yes | The two must match. Use the eye icon to show the password. |
   | Referral ID | No | The code your agent gave you. It links your account to that agent. If you leave it blank, your account goes under the site operator. A code that doesn't exist is rejected. |
   | Email | No | |
   | Bank Name, Bank Account, Depositor | No | Your bank, account number, and the account holder's name. The operator uses them to match deposits and pay out withdrawals. Fill them in now to avoid delays later. |

3. Click **Sign Up**. You'll see: *Your sign-up request has been submitted and is pending approval.*

**Your account can't sign in until an operator approves it.** Until then, signing in shows *This account is not active.* Contact your agent or the operator if approval takes too long.

## 2. Sign in and sign out

- **Sign in:** click **Sign In**, enter your Login ID and password, and click **Sign In**.
- **Sign out:** open the account menu (your name, top right) and click **Logout**.
- **Session length:** you stay signed in for up to **12 hours**, even if you close the browser. After that, or if the operator deactivates your account, you're signed out automatically and asked to sign in again.
- If you click a game while signed out, the sign-in window opens first.

## 3. Finding your way around

| Area | What's there |
|---|---|
| **Header** (top) | Logo (back to home), your **Balance** and **Points**, the **Deposit** shortcut, and your account menu. |
| **Account menu** (your name) | Balance and points, plus **Deposit**, **Withdraw**, **Point Convert**, **Transactions** and **Logout**. |
| **Sidebar** (left) | **Home**, **Hot Games**, **Slots**, **All Providers**, and the **Dark / Light** theme switch. Use the ☰ button to collapse or expand it. |
| **Home page** | A banner with featured games, then scrolling rows of **Hot Games** and **Slots**. Click **All** on a row to see the full list. |
| **Bottom bar** (phones) | Quick buttons for Hot Games, Home and Slots. |

The operator can hide whole game categories (Slots, Live Casino). A hidden category disappears from the menu, the home page and the provider list.

## 4. Balance and points

You have two separate amounts, both shown in the header:

| | What it is | How it goes up | How it goes down |
|---|---|---|---|
| **Balance** ($) | Money you play with | Accepted deposits, game wins, operator payments, point conversions | Bets, accepted withdrawals, operator collections |
| **Points** (P) | Bonus points | Given by the operator | Converting to balance, operator collections |

**Your balance updates by itself.** After a spin, an accepted deposit, or any other change, the header shows the new amount within a second or two.

Games open in a separate window. When you come back to the casino tab, the balance is refreshed automatically. Reloading the page (F5) always shows your current balance.

## 5. Playing games

1. Find a game:
   - **Hot Games**: the most popular games.
   - **Slots**: all slot games.
   - **All Providers**: pick a game studio, then a game from it.
   - The featured games in the home page banner, and the home page rows.
2. Click the game. It opens in a **new browser window or tab**.
3. Bets and wins come from and go to your **Balance**. You need enough balance to bet.
4. When you're done, close the game window and return to the casino tab. Your balance is already updated.

If nothing opens when you click a game:

- **Your browser blocked the pop-up.** Look for a "pop-up blocked" icon in the address bar and choose *Always allow pop-ups from this site*. Then click the game again.
- **You're not signed in,** or your session expired. The sign-in window appears. Sign in and try again.
- **The game window opens and then closes right away.** The game service is temporarily unavailable. Try again in a few minutes or contact support.

## 6. Deposit

A deposit is a **request**. The operator confirms the payment before your balance changes.

1. Open **Deposit** from the header shortcut or the account menu.
2. Choose a preset amount ($10–$2,500) or type any amount greater than zero.
3. Click **Request**. You'll see *Deposit requested successfully.*
4. Send the payment the way your operator or agent tells you.
5. When the operator **accepts** the request, the amount is added to your balance and the header updates by itself.

Rules:

- You can have **one pending deposit at a time**. A second request shows *Pending request exists.* Wait for the first one to be accepted or rejected.
- A **rejected** request doesn't change your balance.
- Check the status at any time under **Transactions**.

## 7. Withdraw

A withdrawal is also a **request** that the operator processes.

1. Open **Withdraw** from the account menu.
2. Enter an amount no larger than your current balance. A larger amount shows *Withdrawal amount exceeds your available balance.*
3. Click **Request**. You'll see *Withdraw requested successfully.*
4. When the operator **accepts** it, the amount is taken from your balance and paid to the bank details on your account.

Rules:

- **Your balance doesn't drop when you submit the request.** It drops only when the request is accepted. If you spend the balance in games in the meantime, the operator can't accept the withdrawal.
- **One pending withdrawal at a time.**
- If you didn't enter bank details at sign-up, give them to your operator or agent.

## 8. Convert points to balance

Points can be turned into playable balance at any time, at **1 point = $1**.

1. Open **Point Convert** from the account menu. The page shows your current points.
2. Enter how many points to convert (no more than you have).
3. Click **Convert**. The change is **immediate**: points go down and balance goes up by the same amount. You don't need to wait for approval.

Not enough points shows *You don't have enough points.*

## 9. Transaction history

Open **Transactions** from the account menu to see every balance movement on your account, newest first.

| Column | Meaning |
|---|---|
| Type | **DEPOSIT**, **WITHDRAW**, **POINT CONVERT**, **PAYMENT** (the operator added balance), **COLLECT** (the operator removed balance) |
| Amount | How much moved |
| Before / After | Your balance before and after. For a pending request, *After* is empty until it's processed. |
| Status | **PENDING** (waiting for the operator), **FINISHED** (done), **REJECTED** (declined, balance unchanged) |
| Time | When it happened, in your local time |

Use **From** and **End** to show only a date range.

Individual game bets and wins aren't listed here. Their effect shows in your balance.

## 10. Settings: theme and mobile

- **Dark / Light theme:** switch at the bottom of the sidebar. Your choice is remembered on this device.
- **Phones and tablets:** the site adapts to small screens. Balance and points move into the account menu, and a bottom bar gives quick access to Hot Games, Home and Slots.

## 11. Common questions

**I signed up but can't sign in.**
Your account is waiting for operator approval. You'll see *This account is not active.* until it's approved.

**I forgot my password.**
There's no self-service reset. Contact your agent or the operator.

**My deposit is still pending.**
The operator handles requests by hand. Make sure you've sent the payment, then contact support if it takes too long.

**My balance looks wrong.**
Reload the page (F5). The balance is always read fresh from the server. If it's still wrong, check **Transactions** and contact support with the time of the problem.

**A game closed while I was playing. Did I lose my bet?**
Every bet and win is recorded by the game provider and the casino as it happens. Reload the casino page to see your up-to-date balance. If it still looks wrong, contact support with the game name and time.

**I was signed out unexpectedly.**
Sessions last 12 hours. You'll also be signed out if the operator deactivates the account. Sign in again.
