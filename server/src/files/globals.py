
def print(obj, sep='', end="\n", file=sys.stdout, flush=False):
	"""
	Prints the values to a stream, or to sys.stdout by default.
	
	Args:
		sep: string inserted between values, default a space.
		end: string appended after the last value, default a newline.
		file: a file-like object (stream); defaults to the current sys.stdout.
		flush: whether to forcibly flush the stream.
	"""
	pass
def dir(obj):
	"""
	dir([object]) -> list of strings
	
	If called without an argument, return the names in the current scope.
	Else, return an alphabetized list of names comprising (some of) the attributes
	of the given object, and of attributes reachable from it.
	If the object supplies a method named __dir__, it will be used; otherwise
	the default dir() logic is used and returns:
	  for a module object: the module's attributes.
	  for a class object:  its attributes, and recursively the attributes
	    of its bases.
	  for any other object: its attributes, its class's attributes, and
	    recursively the attributes of its class's base classes.
	"""
	pass
def next(iterator, default=None):
	"""
	next(iterator[, default])
	
	Return the next item from the iterator. If default is given and the iterator
	is exhausted, it is returned instead of raising StopIteration.
	"""
	pass
def len(obj)->int:
	"""
	Return the number of items in a container.
	When the object is a string, the `len()` function return the number of characters in the string.

	Args:
		obj: Required. An object. Must be a sequence or a collection.
	Returns:
		int: The length of the container.
	"""
	pass
def reversed(sequence)->iterator:
	"""
	Returns a reversed iterator object
	
	Args:
		sequence: Required. Any iterable object.

	Returns:
		An iterable object.
	"""
	pass
def int(value, base=10)->int:
	"""
	Convert the value into an integer.
	Args:
		value: A number or a string that can be converted into an integer number
		base: A number representing the number format. Default value: 10
	Returns:
		int: The integer
	"""
	pass
def str(object, encoding="UTF-8", errors=None)->str:
	"""
	Converts the specified object into a string.
	Args:
		object: Any object. Specifies the object to convert into a string
		encoding: The encoding of the object. Default is UTF-8
		errors: Specifies what to do if the decoding fails
	Returns:
		str: The string representation of the object
	"""
	pass
def hex(integer: int):
	"""
	Return the hexadecimal representation of an integer.
	
	>>> hex(12648430)
	'0xc0ffee'

	Args:
		integer: The integer to convert
	Returns:
		Hexadecimal representation of the integer.
	"""
	pass
def min(iterable):
	"""
	min(iterable, *[, default=obj, key=func]) -> value
	min(arg1, arg2, *args, *[, key=func]) -> value
	
	With a single iterable argument, return its smallest item. The
	default keyword-only argument specifies an object to return if
	the provided iterable is empty.
	With two or more arguments, return the smallest argument.
	"""
	pass
def max(iterable):
	"""
	max(iterable, *[, default=obj, key=func]) -> value
	max(arg1, arg2, *args, *[, key=func]) -> value
	
	With a single iterable argument, return its biggest item. The
	default keyword-only argument specifies an object to return if
	the provided iterable is empty.
	With two or more arguments, return the largest argument.
	"""
	pass
def abs(number):
	"""
	Return the absolute value of the argument.
	"""
	pass
def map(function, iterable):
	"""
	The `map()` function executes a specified function for each item in an iterable. The item is sent to the function as a parameter.

	Args:
		function: Required. The function to execute for each item.
		iterable: Required. A sequence, collection or an iterator object. You can send as many iterables as you like, just make sure the function has one parameter for each iterable.
	"""
	pass
def filter(function, iterable)->iterator:
	"""
	Returns an iterator where the items are filtered through a function to test if the item is accepted or not.
	Args:
		function: Required. A function to be run for each item in the iterable
		iterable: The iterable to be filtered.
	"""
	pass
def list(iterable)->List:
	"""
	Creates a list object.
	Args:
		iterable: Optional. A sequence, collection, or an iterator object.
	Returns:
		A list, which is a collection which is ordered and changeable.
	"""
	pass
def set(iterable)->Set:
	"""
	Creates a set object. The items in a set list are unordered, so it will appear in random order.
	Args:
		iterable: Optional. A sequence, collection, or an iterator object.
	Returns:
		A new Set.
	"""
	pass
def iter(iterable, sentinel)->iterator:
	"""
	iter(iterable) -> iterator
	iter(callable, sentinel) -> iterator
	
	Get an iterator from an object.  In the first form, the argument must
	supply its own iterator, or be a sequence.
	In the second form, the callable is called until it returns the sentinel.
	"""
	pass
def sorted(iterable, key=None, reverse=False)->List:
	"""
	Return a new list containing all items from the iterable in ascending order.
	
	A custom key function can be supplied to customize the sort order, and the
	reverse flag can be set to request the result in descending order.
	Note: You cannot sort a list that contains BOTH string values AND numeric values.
	"""
	pass
def range(start=0, stop, step=1)->Range:
	"""
	Returns a sequence of numbers, starting from 0 by default, and increments by 1 (by default), and stops before a specified number.

	Args:
		start: Optional. An integer number specifying at which position to start. Default is 0
		stop: Required. An integer number specifying at which position to stop (not included).
		step: Optional. An integer number specifying the incrementation. Default is 1
	Returns:
		iterator: The sequence of numbers
	"""
	pass
