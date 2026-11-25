extends CharacterBody3D

var game: Node3D
var speed := 0.0
var top_speed := 43.0
var steer := 0.0

func setup(owner_game:Node3D) -> void:
	game=owner_game

func _physics_process(delta:float) -> void:
	var throttle:=Input.get_action_strength("accelerate")-Input.get_action_strength("reverse")
	var steering:=Input.get_action_strength("right")-Input.get_action_strength("left")
	if throttle>0:speed=move_toward(speed,top_speed,delta*16.0)
	elif throttle<0:speed=move_toward(speed,-top_speed*0.36,delta*20.0)
	else:speed=move_toward(speed,0,delta*4.4)
	if Input.is_action_pressed("handbrake"):speed=move_toward(speed,0,delta*22.0)
	var traction=clamp(abs(speed)/7.0,0.14,1.0)
	steer=move_toward(steer,steering,delta*3.4)
	rotation.y-=steer*traction*delta*1.75*sign(speed if abs(speed)>0.2 else 1.0)
	var forward=-global_transform.basis.z
	velocity.x=forward.x*speed;velocity.z=forward.z*speed
	velocity.y-=22.0*delta
	move_and_slide()
	if is_on_floor():velocity.y=-0.8
	# Subtle body roll and suspension response convey speed without sacrificing control.
	var body=get_node_or_null("CoupeBody")
	if body:body.rotation.z=lerp(body.rotation.z,-steer*clamp(abs(speed)/top_speed,0,1)*0.035,delta*5)

