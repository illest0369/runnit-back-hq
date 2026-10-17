from rbhq_runpod.handler import process_job

import runpod


if __name__ == "__main__":
    runpod.serverless.start({"handler": process_job})
