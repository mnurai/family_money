from datetime import date
from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

# --- US-08, US-09, US-10: Бизнес-логика транзакций ---

def record_transaction(
    db: Session,
    family_id: int,
    user_id: int,
    user_role: str,
    tx_type: str,  # 'INCOME', 'EXPENSE', 'TRANSFER'
    amount: Decimal,
    source_account_id: int | None,
    destination_account_id: int | None,
    category_id: int | None,
    tx_date: date,
    description: str | None = None
):
    # BR-02: Проверка суммы (больше 0)
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be greater than 0"
        )
    
    # BR-09: Проверка даты (не из будущего)
    if tx_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date cannot be later than today. Use a recurring transaction to plan future payments."
        )

    # --- US-08: RECORD EXPENSE (Расход) ---
    if tx_type == "EXPENSE":
        if not source_account_id or destination_account_id:
            raise HTTPException(status_code=400, detail="Expense requires source account only")
        if not category_id:
            raise HTTPException(status_code=400, detail="Category is required for expense")
        
        # BR-08: Проверка остатка на счете
        source_acc = get_account(db, source_account_id, family_id)
        if source_acc.type != "CREDIT_CARD" and source_acc.current_balance < amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Not enough money on {source_acc.name}"
            )
        
        source_acc.current_balance -= amount

    # --- US-09: RECORD INCOME (Доход) ---
    elif tx_type == "INCOME":
        if not destination_account_id or source_account_id:
            raise HTTPException(status_code=400, detail="Income requires destination account only")
        if not category_id:
            raise HTTPException(status_code=400, detail="Category is required for income")
            
        dest_acc = get_account(db, destination_account_id, family_id)
        dest_acc.current_balance += amount

    # --- US-10: RECORD TRANSFER (Перевод) ---
    elif tx_type == "TRANSFER":
        # BR-05: Счета должны отличаться
        if not source_account_id or not destination_account_id:
            raise HTTPException(status_code=400, detail="Transfer requires source and destination accounts")
        if source_account_id == destination_account_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Choose two different accounts"
            )
        if category_id is not None:
            raise HTTPException(status_code=400, detail="Transfers cannot have a category")

        source_acc = get_account(db, source_account_id, family_id)
        dest_acc = get_account(db, destination_account_id, family_id)

        # BR-08: Проверка денег на списании
        if source_acc.type != "CREDIT_CARD" and source_acc.current_balance < amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Not enough money on {source_acc.name}"
            )

        # NFR-09: Атомарное обновление балансов
        source_acc.current_balance -= amount
        dest_acc.current_balance += amount

    return {"status": "success", "message": "Transaction saved"}