def print(obj, sep='', end="\n", file=sys.stdout, flush=False):
	"""
	Prints the values to a stream, or to sys.stdout by default.\n\nsep\n  string inserted between values, default a space.\nend\n  string appended after the last value, default a newline.\nfile\n  a file-like object (stream); defaults to the current sys.stdout.\nflush\n  whether to forcibly flush the stream.
	"""
	pass
def dir(obj):
	"""
	dir([object]) -> list of strings\n\nIf called without an argument, return the names in the current scope.\nElse, return an alphabetized list of names comprising (some of) the attributes\nof the given object, and of attributes reachable from it.\nIf the object supplies a method named __dir__, it will be used; otherwise\nthe default dir() logic is used and returns:\n  for a module object: the module's attributes.\n  for a class object:  its attributes, and recursively the attributes\n    of its bases.\n  for any other object: its attributes, its class's attributes, and\n    recursively the attributes of its class's base classes.
	"""
	pass
def next(iterator, default=None):
	"""
	next(iterator[, default])\n\nReturn the next item from the iterator. If default is given and the iterator\nis exhausted, it is returned instead of raising StopIteration.
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
	Converts the specified value into a string.
	Args:
		object: Any object. Specifies the object to convert into a string
		encoding: The encoding of the object. Default is UTF-8
		errors: Specifies what to do if the decoding fails
	"""
	pass
def hex(integer: int):
	"""
	Return the hexadecimal representation of an integer.\n\n>>> hex(12648430)\n'0xc0ffee'

	Args:
		integer: The integer to convert
	Returns:
		Hexadecimal representation of the integer.
	"""
	pass
def min(iterable):
	"""
	min(iterable, *[, default=obj, key=func]) -> value\nmin(arg1, arg2, *args, *[, key=func]) -> value\n\nWith a single iterable argument, return its smallest item. The\ndefault keyword-only argument specifies an object to return if\nthe provided iterable is empty.\nWith two or more arguments, return the smallest argument.
	"""
	pass
def max(iterable):
	"""
	max(iterable, *[, default=obj, key=func]) -> value\nmax(arg1, arg2, *args, *[, key=func]) -> value\n\nWith a single iterable argument, return its biggest item. The\ndefault keyword-only argument specifies an object to return if\nthe provided iterable is empty.\nWith two or more arguments, return the largest argument.
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
	iter(iterable) -> iterator\niter(callable, sentinel) -> iterator\n\nGet an iterator from an object.  In the first form, the argument must\nsupply its own iterator, or be a sequence.\nIn the second form, the callable is called until it returns the sentinel.
	"""
	pass
def sorted(iterable, key=None, reverse=False)->List:
	"""
	Return a new list containing all items from the iterable in ascending order.\n\nA custom key function can be supplied to customize the sort order, and the\nreverse flag can be set to request the result in descending order.
	Note: You cannot sort a list that contains BOTH string values AND numeric values.
	"""
	pass
def range(start=0, stop, step=1):
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


# class Set:
# 	def __init__(arg0: any)->Set:
# 		"""
# 		Defines a Set object. A set is a collection of items which are unordered, unchangeable, and unindexed, but you can add or remove items.  
# 		A set cannot contain duplicate values.  
# 		Usage:  
# 		mySet = Set((item1, item2, item3)) #Note the double parentheses!  
# 		OR:
# 		mySet = {item1, item2, item3}
# 		"""
# 		pass
# 	def add(element: any):
# 		""" Add an item to a Set.  
# 		Args:
# 			element (any): the item to add to the set.

# 		Example:  
# 			fruits = {"apple", "banana", "cherry"}
# 			fruits.add("orange")
# 			# Result: {"apple", "banana", "cherry", "orange"}
# 		"""
# 		pass
# 	def clear():
# 		"""
# 		Remove all the elements from the Set

# 		Example:
# 			mySet = {"one","two"}
# 			mySet.clear()
# 			print(mySet) # returns {}
# 		"""
# 		pass
# 	def copy()->Set:
# 		"""
# 		Returns a copy of the Set.

# 		Returns:
# 			A copy of the Set.

# 		Example:
# 			mySet = {"one", "two"}
# 			yourSet = mySet.copy()
# 			print(yourSet) # Returns {"one", "two"}
# 		"""
# 		pass
# 	def difference(set1: Set, set2: Set)->Set:
# 		"""
# 		Returns a Set containing the difference between two or more sets.

# 		Args:
# 			set1: Required. The set(s) to check for differences in.
# 			set2: Optional. The other set to search for equal terms in. You can compare as many sets you like. Separate the sets with a comma.
		
# 		Returns:
# 			A set with the differences in the supplied sets.

# 		Example:
# 			mySet = {"one", "two", "three"}
# 			subSet = {"one", "two"}
# 			newSet = mySet.difference(subSet)
# 			print(newSet) # Returns {"three"}
# 		"""
# 		pass
# 	def difference_update(set1: Set, Set2: Set):
# 		"""
# 		Remove the items that exist in both sets

# 		Args:
# 			set1: Requried. The set to check for differences in.
# 			set2: Optional. The other set to search for equal items in. You can compare as many sets as you like. Separate the sets with a comma.

# 		Example:
# 			mySet = {"one", "two", "three"}
# 			otherSet = {"one", "two"}
# 			mySet.difference_update(otherSet)
# 			print(mySet) # Returns {"three"}
# 		"""
# 		pass
# 	def discard(value: any):
# 		"""
# 		Remove the specified item from the Set. Does not throw an error if the value is not in the Set.

# 		Args:
# 			value: The value to remove from the Set.

# 		Example:
# 			fruits = {"apple", "banana", "cherry"}
# 			fruits.discard("banana")
# 			print(fruits) # Returns {"apple", "cherry"}
# 		"""
# 		pass
