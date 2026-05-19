FROM python:3.9-slim
WORKDIR /code

# Audio ෆයිල් (webm/wav) කියවන්න අවශ්‍ය කරන system tools ඉන්ස්ටෝල් කිරීම
RUN apt-get update && apt-get install -y libsndfile1 ffmpeg

COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

COPY . .

# Hugging Face එකේ සර්වර් පෝර්ට් එක 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]