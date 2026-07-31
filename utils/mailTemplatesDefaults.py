from __future__ import annotations

from typing import Any

DEFAULT_MAIL_TEMPLATES_CONFIG: dict[str, Any] = {
    "version": 3,
    "categories": [
        {
            "id": "vendor-outreach",
            "name": "Vendor Outreach",
            "description": "Initial outreach to vendors and recruiters",
            "sortOrder": 0,
        }
    ],
    "templates": [
        {
            "id": "classic",
            "categoryId": "vendor-outreach",
            "name": "Classic",
            "style": "classic",
            "description": "Warm, detailed introduction with full skills list",
            "subject": "Senior DevOps Engineer - Open to C2C & W2 Opportunities",
            "body": (
                "Hi [Recipient Name],\n\n"
                "I hope this message finds you well.\n\n"
                "My name is Utsav Chaudhary, and I'm a Senior DevOps Engineer with 5+ years of experience "
                "supporting production AWS and Azure infrastructure in regulated and enterprise environments. "
                "Most of my work is around Kubernetes (EKS/AKS), GitOps with Argo CD, CI/CD pipelines, "
                "and infrastructure automation with Terraform and Ansible.\n\n"
                "I'm currently open to C2C and W2 opportunities. If you come across any roles that fit my "
                "background, I'd really appreciate you keeping me in mind.\n\n"
                "Key Skills:\n"
                "• AWS, Azure, Kubernetes (EKS/AKS), ECS, Fargate\n"
                "• Terraform, Ansible, Docker, Helm, Argo CD, Rancher\n"
                "• CI/CD (GitHub Actions, Jenkins, Azure DevOps, Bitbucket Pipelines)\n"
                "• Python, Bash, FastAPI, PowerShell\n"
                "• Linux Administration\n"
                "• Monitoring: Prometheus, Grafana, ELK, CloudWatch, Datadog, Application Insights\n\n"
                "Portfolio: https://thatinsaneguy.com\n"
                "LinkedIn: https://www.linkedin.com/in/utsavmaan28/\n"
                "GitHub: https://github.com/UttU28/\n"
                "Email: utsavmaan28@gmail.com\n"
                "Phone: (607) 296-9583\n\n"
                "If you have anything coming up that might be a fit, I'd be happy to chat.\n\n"
                "Thank you for your time!\n\n"
                "Thanks & Regards,\n"
                "Utsav Chaudhary"
            ),
            "sortOrder": 0,
            "isDefault": True,
        },
        {
            "id": "classy",
            "categoryId": "vendor-outreach",
            "name": "Classy",
            "style": "classy",
            "description": "Concise, polished tone for senior contacts",
            "subject": "Senior DevOps Engineer - C2C & W2 Availability",
            "body": (
                "Dear [Recipient Name],\n\n"
                "I hope you're doing well.\n\n"
                "I'm Utsav Chaudhary, a Senior DevOps Engineer with 5+ years of experience building and "
                "operating production cloud platforms on AWS and Azure. I spend most of my time on "
                "Kubernetes (EKS/AKS), GitOps with Argo CD, Terraform, CI/CD pipelines, and observability "
                "in regulated enterprise environments.\n\n"
                "I'm looking at C2C and W2 opportunities right now and would appreciate being considered "
                "for any roles that match my background.\n\n"
                "Highlights:\n"
                "• Cloud & IaC: AWS, Azure, Terraform, Ansible, ECS, Fargate\n"
                "• Containers & GitOps: Kubernetes, Docker, Helm, Argo CD, Rancher\n"
                "• Delivery: GitHub Actions, Jenkins, Azure DevOps, Bitbucket\n"
                "• Scripting & ops: Python, Bash, PowerShell, Linux, Prometheus, Grafana, ELK, Datadog\n\n"
                "You can review my work here:\n"
                "https://thatinsaneguy.com\n"
                "https://www.linkedin.com/in/utsavmaan28/\n"
                "https://github.com/UttU28/\n\n"
                "Email: utsavmaan28@gmail.com\n"
                "Phone: (607) 296-9583\n\n"
                "Happy to connect if anything on your desk looks like a fit.\n\n"
                "Warm regards,\n"
                "Utsav Chaudhary"
            ),
            "sortOrder": 1,
            "isDefault": False,
        },
    ],
    "defaultTemplateId": "classic",
}
