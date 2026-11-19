"""Telegram notification bot for Family Budget Tracker.

Sends a family chat two kinds of alerts:
  * a transaction larger than BIG_TX_THRESHOLD (default 50 000 ₸)
  * an account whose balance fell below LOW_BALANCE_THRESHOLD (default 10 000 ₸)
"""
