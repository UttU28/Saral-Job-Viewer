from utils.utilsDatabase import getSession, JobPosting, updateJobAIResponse
from utils.utilsAI import safe_ai_call
from prompts import JOB_CLASSIFIER_PROMPT
from typing import List, Dict, Optional

def get_unprocessed_jobs(limit: Optional[int] = None) -> List[JobPosting]:
    session = getSession()
    try:
        query = session.query(JobPosting).filter(JobPosting.aiTags == None).order_by(JobPosting.timeStamp.desc())
        return query.limit(limit).all() if limit else query.all()
    finally:
        session.close()


def process_single_job(job: JobPosting, verbose: bool = True) -> Dict:
    completeJob = f"""Title: {job.title}
Company: {job.companyName}
Location: {job.location}
{job.jobDescription}"""
    
    prompt = JOB_CLASSIFIER_PROMPT.format(completeJob=completeJob)
    
    if verbose:
        print(f"Processing: {job.title}")
    
    result = safe_ai_call(prompt, "openai")
    
    if result["success"]:
        if updateJobAIResponse(job.id, result["response"]):
            return {"success": True, "job_id": job.id, "message": "Updated"}
        else:
            return {"success": False, "job_id": job.id, "message": "DB update failed"}
    else:
        return {"success": False, "job_id": job.id, "message": result['error']}


def process_unprocessed_jobs(limit: Optional[int] = None, verbose: bool = True) -> Dict:
    jobs = get_unprocessed_jobs(limit)
    
    if verbose:
        print(f"Found {len(jobs)} unprocessed jobs")
    
    results = []
    successful = 0
    failed = 0
    
    for job in jobs:
        result = process_single_job(job, verbose)
        results.append(result)
        
        if result["success"]:
            successful += 1
        else:
            failed += 1
    
    summary = {
        "total": len(jobs),
        "successful": successful,
        "failed": failed,
        "results": results
    }
    
    if verbose:
        print(f"\nComplete - Total: {summary['total']} | Success: {summary['successful']} | Failed: {summary['failed']}")
    
    return summary


if __name__ == "__main__":
    process_unprocessed_jobs()

