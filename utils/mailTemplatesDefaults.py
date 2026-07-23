from __future__ import annotations

from typing import Any

DEFAULT_MAIL_TEMPLATES_CONFIG: dict[str, Any] = {
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
            "subject": "DevOps Engineer - Open to C2C & W2 Opportunities",
            "body": (
                "Hi [Recipient Name],\n\n"
                "I hope this message finds you well.\n\n"
                "My name is Utsav Chaudhary, and I'm a DevOps Engineer with around 5 years of experience "
                "specializing in cloud infrastructure design and management (AWS & Azure), CI/CD pipelines, "
                "Kubernetes (EKS/AKS), and infrastructure automation.\n\n"
                "I am currently open to exploring C2C and W2 opportunities. If you come across any roles "
                "suited to my background, I'd greatly appreciate your consideration.\n\n"
                "Key Skills:\n"
                "• AWS, Azure, Kubernetes (EKS/AKS)\n"
                "• Terraform, Ansible, Docker, Helm\n"
                "• CI/CD (GitHub Actions, Jenkins, Azure DevOps, Bitbucket Pipelines)\n"
                "• Python, Bash, FastAPI\n"
                "• Linux Administration\n"
                "• Monitoring: Prometheus, Grafana, ELK, CloudWatch\n\n"
                "Portfolio: https://thatinsaneguy.com\n"
                "LinkedIn: https://www.linkedin.com/in/utsavmaan28/\n"
                "GitHub: https://github.com/UttU28/\n"
                "Email: utsavmaan28@gmail.com\n"
                "Phone: (607) 296-9583\n\n"
                "If you have or anticipate any opportunities that align with my experience, I would welcome "
                "the chance to discuss further.\n\n"
                "Thank you for your time and consideration!\n\n"
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
            "subject": "DevOps Engineer - C2C & W2 Availability",
            "body": (
                "Dear [Recipient Name],\n\n"
                "I hope you're doing well.\n\n"
                "I'm Utsav Chaudhary, a DevOps Engineer with five years of experience building and operating "
                "cloud platforms on AWS and Azure, from Kubernetes (EKS/AKS) and Terraform to CI/CD pipelines "
                "and production observability.\n\n"
                "I'm presently exploring C2C and W2 opportunities and would value the chance to be considered "
                "for any roles that match my background.\n\n"
                "Highlights:\n"
                "• Cloud & IaC: AWS, Azure, Terraform, Ansible\n"
                "• Containers: Kubernetes, Docker, Helm\n"
                "• Delivery: GitHub Actions, Jenkins, Azure DevOps, Bitbucket\n"
                "• Scripting & ops: Python, Bash, Linux, Prometheus, Grafana, ELK\n\n"
                "You can review my work here:\n"
                "https://thatinsaneguy.com\n"
                "https://www.linkedin.com/in/utsavmaan28/\n"
                "https://github.com/UttU28/\n\n"
                "Email: utsavmaan28@gmail.com\n"
                "Phone: (607) 296-9583\n\n"
                "I'd welcome a brief conversation if anything on your desk might be a fit.\n\n"
                "Warm regards,\n"
                "Utsav Chaudhary"
            ),
            "sortOrder": 1,
            "isDefault": False,
        },
    ],
    "defaultTemplateId": "classic",
}
