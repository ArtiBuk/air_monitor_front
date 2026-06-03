## Frontend MR

**Title**  
Model selection UI: show dataset freshness and align leaderboard with production policy

**Краткое описание**  
Обновлен frontend Air Monitor Lab под новую policy выбора модели: в интерфейсе теперь видно свежесть датасета, а текст и таблицы больше не утверждают, что приоритет строится только на RMSE/MAE/MAPE и объеме датасета.

**Изменения**
- обновлен тип `ModelLeaderboardEntry` под новые поля backend API
- в карточке активной модели добавлена свежесть датасета
- в таблицы leaderboard добавлена колонка `Свежесть`
- обновлен текст в UI про логику выбора активной модели
- синхронизированы `Dashboard` и `Models` page с новой production policy

**Проверка**
```bash
make build
make up
make check
```
