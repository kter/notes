"""AWS コストレポートを毎日メールで送信する Lambda 関数。

責務: Cost Explorer API でコストデータを取得し SES でメール送信する。
主要なエクスポート: handler (Lambda エントリポイント),
    get_cost_data, create_email_html, send_email
呼び出し関係: EventBridge スケジュールから handler が起動され、
    AWS Cost Explorer (us-east-1) と SES (ap-northeast-1) を呼び出す。
"""

import json
import os
from datetime import datetime, timedelta
from typing import Any

import boto3


def get_cost_data(ce_client: Any) -> dict:
    """Cost Explorer API から当月累計・前々日・サービス別コストを取得して返す。"""
    today = datetime.utcnow().date()

    # 当月の開始日
    month_start = today.replace(day=1)

    # 前々日（当日・前日はデータが不完全なため）
    day_before_yesterday = today - timedelta(days=2)

    # 当月累計コスト
    monthly_response = ce_client.get_cost_and_usage(
        TimePeriod={"Start": month_start.isoformat(), "End": today.isoformat()},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
    )

    monthly_cost = (
        float(monthly_response["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"])
        if monthly_response["ResultsByTime"]
        else 0.0
    )

    # 前々日のコスト
    daily_response = ce_client.get_cost_and_usage(
        TimePeriod={
            "Start": day_before_yesterday.isoformat(),
            "End": (day_before_yesterday + timedelta(days=1)).isoformat(),
        },
        Granularity="DAILY",
        Metrics=["UnblendedCost"],
    )

    daily_cost = (
        float(daily_response["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"])
        if daily_response["ResultsByTime"]
        else 0.0
    )

    # サービス別コスト（当月）
    service_response = ce_client.get_cost_and_usage(
        TimePeriod={"Start": month_start.isoformat(), "End": today.isoformat()},
        Granularity="MONTHLY",
        Metrics=["UnblendedCost"],
        GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
    )

    services = []
    if service_response["ResultsByTime"]:
        for group in service_response["ResultsByTime"][0].get("Groups", []):
            service_name = group["Keys"][0]
            cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
            if cost > 0.01:  # $0.01以上のサービスのみ
                services.append({"name": service_name, "cost": cost})

    services.sort(key=lambda x: x["cost"], reverse=True)

    return {
        "monthly_cost": monthly_cost,
        "daily_cost": daily_cost,
        "day_before_yesterday": day_before_yesterday.isoformat(),
        "month_start": month_start.isoformat(),
        "today": today.isoformat(),
        "services": services[:10],  # 上位10サービス
    }


def create_email_html(cost_data: dict) -> str:
    """コストデータを元に HTML メール本文を生成して返す。"""
    services_html = ""
    for svc in cost_data["services"]:
        services_html += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">{svc["name"]}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${svc["cost"]:.2f}</td>
        </tr>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; }}
            .content {{ background: #fff; padding: 20px; border: 1px solid #eee; border-radius: 0 0 10px 10px; }}
            .cost-box {{ background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; }}
            .cost-value {{ font-size: 2em; font-weight: bold; color: #667eea; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
            th {{ background: #f8f9fa; padding: 10px; text-align: left; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">📊 AWS Daily Cost Report</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">{cost_data["today"]}</p>
            </div>
            <div class="content">
                <div class="cost-box">
                    <p style="margin: 0; color: #666;">当月累計コスト ({cost_data["month_start"]} 〜 {cost_data["today"]})</p>
                    <p class="cost-value">${cost_data["monthly_cost"]:.2f}</p>
                </div>
                
                <div class="cost-box">
                    <p style="margin: 0; color: #666;">前々日のコスト ({cost_data["day_before_yesterday"]})</p>
                    <p class="cost-value">${cost_data["daily_cost"]:.2f}</p>
                </div>
                
                <h3>📋 サービス別コスト（当月・上位10）</h3>
                <table>
                    <thead>
                        <tr>
                            <th>サービス</th>
                            <th style="text-align: right;">コスト</th>
                        </tr>
                    </thead>
                    <tbody>
                        {services_html}
                    </tbody>
                </table>
                
                <p style="color: #999; font-size: 0.9em; margin-top: 20px;">
                    このレポートはAWS Cost Explorer APIから自動生成されています。
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


def send_email(
    ses_client: Any, to_email: str, subject: str, html_body: str, from_email: str
) -> dict:
    """SES を使って HTML メールを送信し、レスポンスを返す。"""
    response = ses_client.send_email(
        Source=from_email,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    )
    return response


def handler(event: dict, context: Any) -> dict:
    """Lambda エントリポイント。コストデータを取得してメールを送信する。"""
    # 環境変数から設定を取得
    to_email = os.environ.get("TO_EMAIL", "takahashi@tomohiko.io")
    from_email = os.environ.get("FROM_EMAIL", "noreply@devtools.site")

    # クライアント初期化
    ce_client = boto3.client(
        "ce", region_name="us-east-1"
    )  # Cost ExplorerはUS East 1固定
    ses_client = boto3.client("ses", region_name="ap-northeast-1")

    try:
        # コストデータ取得
        cost_data = get_cost_data(ce_client)

        # メール生成・送信
        subject = f"[AWS Cost Report] {cost_data['today']} - Monthly: ${cost_data['monthly_cost']:.2f}"
        html_body = create_email_html(cost_data)

        send_email(ses_client, to_email, subject, html_body, from_email)

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Cost report sent successfully",
                    "monthly_cost": cost_data["monthly_cost"],
                    "daily_cost": cost_data["daily_cost"],
                }
            ),
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
