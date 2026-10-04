sampler2D tex : register(s0);
float4 texel : register(c10);	// xy: size of one source texel
float4 bounds : register(c11);	// valid source texcoords: xy min, zw max
float4 bloomParams : register(c12);	// x: threshold, y: soft knee

float3 Fetch(float2 uv)
{
	return tex2D(tex, clamp(uv, bounds.xy, bounds.zw)).rgb;
}

float4 main(in float2 texcoord : TEXCOORD0) : COLOR0
{
	float2 uv = texcoord.xy;
	float2 px = texel.xy;

	// 4 bilinear taps average a 4x4 block of the full resolution image
	float3 c = Fetch(uv + float2(-1.0, -1.0)*px);
	c += Fetch(uv + float2( 1.0, -1.0)*px);
	c += Fetch(uv + float2(-1.0,  1.0)*px);
	c += Fetch(uv + float2( 1.0,  1.0)*px);
	c *= 0.25;

	// bright pass with a soft knee so lights fade in instead of popping
	float threshold = bloomParams.x;
	float knee = bloomParams.y;
	float brightness = max(c.r, max(c.g, c.b));
	float soft = clamp(brightness - threshold + knee, 0.0, 2.0*knee);
	soft = soft*soft / (4.0*knee + 0.00001);
	float contribution = max(soft, brightness - threshold) / max(brightness, 0.00001);

	float4 color;
	color.rgb = c*contribution;
	color.a = 1.0;
	return color;
}
