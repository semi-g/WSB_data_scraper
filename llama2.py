import sys
from transformers import AutoTokenizer, logging, pipeline
from auto_gptq import AutoGPTQForCausalLM, BaseQuantizeConfig


# Get input and output file name from command line tool
# input_file_path = sys.argv[1]
# output_file_path = sys.argv[2]
input_file_path = 'input.txt'
output_file_path = 'output.txt'

# Read data from the input file
with open(input_file_path, 'r', encoding='utf-8') as input_file:
    prompt = input_file.read()

# Define model path and name
model_path = "../../AI_models/Llama_2/7b_uncensored_chat_GPTQ/llama2_7b_chat_uncensored-GPTQ"
model_basename = "model"

# Load tokenizer and quantized model
tokenizer = AutoTokenizer.from_pretrained(model_path, use_fast=True)
model = AutoGPTQForCausalLM.from_quantized(
    model_path,
    model_basename=model_basename,
    revision="gptq-4bit-32g-actorder_True",
    use_safetensors=True,
    device="cuda:0",
    use_triton=False,
    quantize_config=None,
    disable_exllama=True
)

# Generate prompt template 
prompt_template=f'''### HUMAN:
{prompt}

### RESPONSE:
'''

print("\n\n*** Generate:")

# # Tokenize the prompt template and move to cuda + run the inference
# input_ids = tokenizer(prompt_template, return_tensors='pt').input_ids.cuda()
# output = model.generate(inputs=input_ids, temperature=0.8, max_new_tokens=512)
# response_full = tokenizer.decode(output[0])
# response_start = response_full.find("### RESPONSE:")
# response_clean = response_full[response_start + len("### RESPONSE:"):].strip()

# print(response_clean)


logging.set_verbosity(logging.CRITICAL)

print("*** Pipeline:")
pipe = pipeline(
    "text-generation",
    model=model,
    tokenizer=tokenizer,
    max_new_tokens=512,
    temperature=0.60,
    top_p=0.85,
    repetition_penalty=1.10
)

response_full = pipe(prompt_template)[0]['generated_text']
response_start = response_full.find("### RESPONSE:")
response_clean = response_full[response_start + len("### RESPONSE:"):].strip()

# Wrtie data to the ouput file   
with open(output_file_path, 'w') as output_file:
    output_file.write(response_clean)

