"""
沪深300ETF (510300) 历史数据抓取 + 多维波动率分析
近10年日线数据 → 日/周/月/季/年波动率
"""
import akshare as ak
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# ── 1. 获取近10年日线数据 ──
end_date = datetime.now().strftime("%Y%m%d")
start_date = "20160701"  # 约10年

print("正在获取沪深300ETF(510300)近10年日线数据...")
df = ak.fund_etf_hist_em(
    symbol="510300",
    period="daily",
    start_date=start_date,
    end_date=end_date,
    adjust="hfq"  # 后复权，用于收益率计算
)

# ── 2. 数据清洗 ──
df['日期'] = pd.to_datetime(df['日期'])
df = df.sort_values('日期').reset_index(drop=True)
df['日收益率'] = df['收盘'].pct_change() * 100  # 百分比

print(f"数据时间范围: {df['日期'].min().date()} ~ {df['日期'].max().date()}")
print(f"总交易日数: {len(df)}")
print()

# ── 3. 设置时间索引 ──
df_indexed = df.set_index('日期')
df_indexed['年'] = df_indexed.index.year
df_indexed['月'] = df_indexed.index.month
df_indexed['周'] = df_indexed.index.isocalendar().week.astype(int)
# 季度
df_indexed['季'] = df_indexed.index.quarter

# ── 4. 计算各维度波动率 ──

# 4a. 日波动率（按年统计）
daily_vol_by_year = df_indexed.groupby('年').agg(
    交易日数=('日收益率', 'count'),
    日收益率均值_pct=('日收益率', 'mean'),
    日波动率_pct=('日收益率', 'std')
).round(4)

# 年化波动率 (252个交易日)
daily_vol_by_year['年化波动率_pct'] = (daily_vol_by_year['日波动率_pct'] * np.sqrt(252)).round(4)

# 4b. 周波动率
weekly = df_indexed.groupby(['年', '周']).agg(
    周收益率=('日收益率', 'sum')
)
weekly_vol_by_year = weekly.groupby('年').agg(
    周数=('周收益率', 'count'),
    周波动率_pct=('周收益率', 'std'),
    周收益率均值_pct=('周收益率', 'mean')
).round(4)
weekly_vol_by_year['年化周波动率_pct'] = (weekly_vol_by_year['周波动率_pct'] * np.sqrt(52)).round(4)

# 4c. 月波动率
monthly = df_indexed.groupby(['年', '月']).agg(
    月收益率=('日收益率', 'sum')
)
monthly_vol_by_year = monthly.groupby('年').agg(
    月数=('月收益率', 'count'),
    月波动率_pct=('月收益率', 'std'),
    月收益率均值_pct=('月收益率', 'mean')
).round(4)
monthly_vol_by_year['年化月波动率_pct'] = (monthly_vol_by_year['月波动率_pct'] * np.sqrt(12)).round(4)

# 4d. 季波动率
quarterly = df_indexed.groupby(['年', '季']).agg(
    季收益率=('日收益率', 'sum')
)
quarterly_vol_by_year = quarterly.groupby('年').agg(
    季数=('季收益率', 'count'),
    季波动率_pct=('季收益率', 'std'),
    季收益率均值_pct=('季收益率', 'mean')
).round(4)
quarterly_vol_by_year['年化季波动率_pct'] = (quarterly_vol_by_year['季波动率_pct'] * np.sqrt(4)).round(4)

# 4e. 年度波动率（直接基于年收益率）
yearly = df_indexed.groupby('年').agg(
    年收益率_pct=('日收益率', 'sum')
).round(4)

# ── 5. 合并输出表格 ──

# 表格1: 年度汇总 (含日/年化波动率)
table1 = pd.DataFrame({
    '年份': daily_vol_by_year.index,
    '交易日数': daily_vol_by_year['交易日数'].values,
    '日收益率均值(%)': daily_vol_by_year['日收益率均值_pct'].values,
    '年收益率(%)': yearly['年收益率_pct'].values,
    '日波动率(%)': daily_vol_by_year['日波动率_pct'].values,
    '年化波动率(%)': daily_vol_by_year['年化波动率_pct'].values,
}).set_index('年份')

print("=" * 85)
print("沪深300ETF(510300) 近10年年度收益与波动率汇总")
print("=" * 85)
print(table1.to_string())
print()

# 表格2: 多维度波动率对比（年化后）
table2 = pd.DataFrame({
    '年份': daily_vol_by_year.index,
    '日波动率(%)': daily_vol_by_year['日波动率_pct'].values,
    '周波动率(%)': weekly_vol_by_year['周波动率_pct'].values,
    '月波动率(%)': monthly_vol_by_year['月波动率_pct'].values,
    '季波动率(%)': quarterly_vol_by_year['季波动率_pct'].values,
    '年化(日计)(%)': daily_vol_by_year['年化波动率_pct'].values,
    '年化(周计)(%)': weekly_vol_by_year['年化周波动率_pct'].values,
    '年化(月计)(%)': monthly_vol_by_year['年化月波动率_pct'].values,
    '年化(季计)(%)': quarterly_vol_by_year['年化季波动率_pct'].values,
}).set_index('年份')

print("=" * 120)
print("多维度波动率对比（原始周期波动率 + 年化值）")
print("=" * 120)
print(table2.to_string())
print()

# 表格3: 近10年整体统计
print("=" * 60)
print("近10年整体统计")
print("=" * 60)

all_daily_vol = df['日收益率'].std()
all_weekly_vol = weekly['周收益率'].std()
all_monthly_vol = monthly['月收益率'].std()
all_quarterly_vol = quarterly['季收益率'].std()

print(f"统计区间: {df['日期'].min().date()} ~ {df['日期'].max().date()}")
print(f"总交易日: {len(df)}")
print(f"总周数: {len(weekly)}")
print(f"总月数: {len(monthly)}")
print(f"总季数: {len(quarterly)}")
print(f"总年数: {len(yearly)}")
print()
print(f"{'指标':<20} {'原始波动率(%)':<18} {'年化波动率(%)':<18}")
print("-" * 56)
print(f"{'日波动率':<20} {all_daily_vol:<18.4f} {all_daily_vol * np.sqrt(252):<18.4f}")
print(f"{'周波动率':<20} {all_weekly_vol:<18.4f} {all_weekly_vol * np.sqrt(52):<18.4f}")
print(f"{'月波动率':<20} {all_monthly_vol:<18.4f} {all_monthly_vol * np.sqrt(12):<18.4f}")
print(f"{'季波动率':<20} {all_quarterly_vol:<18.4f} {all_quarterly_vol * np.sqrt(4):<18.4f}")
print()

# 表格4: 每月度波动率热力图
print("=" * 80)
print("各年月度波动率(%)")
print("=" * 80)

monthly_pivot_table = df_indexed.groupby(['年', '月']).agg(
    月收益率=('日收益率', 'std')
).reset_index()
monthly_pivot_table = monthly_pivot_table.pivot_table(
    values='月收益率',
    index='年',
    columns='月',
    aggfunc='first'
).round(4)
monthly_pivot_table.columns = [f'{m}月' for m in monthly_pivot_table.columns]
print(monthly_pivot_table.to_string())
print()

# 保存到Excel
output_file = "D:\\新项目\\CSI300_ETF_Volatility_Analysis.xlsx"
print(f"正在保存Excel到: {output_file}")

with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='日线数据', index=False)
    table1.to_excel(writer, sheet_name='年度汇总')
    table2.to_excel(writer, sheet_name='多维波动率对比')
    weekly.to_excel(writer, sheet_name='周收益率')
    monthly.to_excel(writer, sheet_name='月收益率')
    monthly_pivot_table.to_excel(writer, sheet_name='月度波动率热力图')

print("Excel 已保存!")
print()
print("📁 文件路径:", output_file)
